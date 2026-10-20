import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { after, before, beforeEach, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import {
  admin,
  lifecycleFixture,
  ownerA,
  ownerB,
  requester,
} from './draft-lifecycle.fixture';
import {
  AttachmentStorage,
  pathInside,
  requestFolderName,
} from '../src/requests/attachment-storage';
import { RequestAttachmentsService } from '../src/requests/request-attachments.service';
import type { PsfRequestResponse } from '../src/requests/requests.service';

let db: PGlite;
let root: string;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;

before(
  async () => {
    // A real directory stands in for the NAS share.
    root = await mkdtemp(join(tmpdir(), 'psf-attachments-'));
    process.env.ATTACHMENT_STORAGE_PATH = root;
    db = new PGlite();
    const query = (sql: string, values?: unknown[]) => db.query(sql, values);
    fixture = await lifecycleFixture({
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool);
  },
  { timeout: 30000 },
);
after(async () => {
  delete process.env.ATTACHMENT_STORAGE_PATH;
  await db.close();
  await rm(root, { recursive: true, force: true });
});
beforeEach(() => fixture.reset());

const file = (originalname: string, content = originalname) => ({
  originalname,
  buffer: Buffer.from(content),
});
const folderOf = (request: Pick<PsfRequestResponse, 'numericId'>) =>
  `Test request_${request.numericId}`;
const filesIn = async (folder: string) =>
  (await readdir(join(root, folder))).sort();
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
const rowCount = async (requestId: string) =>
  (
    await db.query(
      'SELECT 1 FROM psf_request_attachments WHERE request_id = $1',
      [requestId],
    )
  ).rows.length;
const saveTitle = (
  request: PsfRequestResponse,
  title: string,
  actor = requester,
) =>
  fixture.service.updateDraftRequesterData(
    request.id,
    {
      formVersion: request.formVersion,
      expectedUpdatedAt: request.updatedAt,
      requesterData: { ...request.requesterData, title },
    },
    actor,
  );

void it('names a request folder [Product_Description]_[ID], or _[ID] while blank', () => {
  assert.equal(requestFolderName('Chip A', 5571), 'Chip A_5571');
  assert.equal(
    requestFolderName(' A/B\\C:D*E?F"G<H>I|J\u0001 ', 7),
    'A_B_C_D_E_F_G_H_I_J__7',
  );
  assert.equal(requestFolderName('   ', 7), '_7');
  assert.equal(requestFolderName(undefined, 7), '_7');
});

void it('keeps request folders inside a Windows mapped drive, drive root or share', () => {
  const windows = win32;
  assert.equal(
    pathInside('Z:/attachment', 'Chip A_5571', windows),
    'Z:\\attachment\\Chip A_5571',
  );
  assert.equal(
    pathInside('Z:\\attachment\\', '_5571', windows),
    'Z:\\attachment\\_5571',
  );
  // A drive root already ends with its separator.
  assert.equal(pathInside('Z:/', 'Chip A_5571', windows), 'Z:\\Chip A_5571');
  assert.equal(
    pathInside('\\\\nas01\\share\\PSF', 'Chip A_5571', windows),
    '\\\\nas01\\share\\PSF\\Chip A_5571',
  );
  assert.equal(pathInside('Z:/attachment', '..', windows), null);
  assert.equal(pathInside('Z:/attachment', '', windows), null);
  assert.equal(pathInside('Z:/attachment', 'C:\\Windows', windows), null);
});

void it('allocates sequential IDs and numbers a submitted Draft PSF- and its six-digit ID', async () => {
  const first = await fixture.draft();
  const second = await fixture.draft();
  assert.equal(second.numericId, first.numericId + 1);
  assert.match(first.requestNo, /^DRAFT-\d{8}-\d{4}$/);

  await fixture.attachments.upload(first.id, [file('spec.pdf')], requester);
  // Attachments change no revision, so the Draft submits with its old one.
  const submitted = await fixture.submit(first);
  assert.equal(
    submitted.requestNo,
    `PSF-${String(first.numericId).padStart(6, '0')}`,
  );
  assert.equal(submitted.numericId, first.numericId);
  const listed = await fixture.attachments.list(first.id, ownerA);
  assert.equal(listed.folderName, folderOf(first));
  assert.deepEqual(
    listed.items.map((item) => item.filename),
    ['spec.pdf'],
  );
  const [indexed] = (
    await db.query<{ request_no: string }>(
      'SELECT request_no FROM psf_request_search_index WHERE request_id = $1',
      [first.id],
    )
  ).rows;
  assert.equal(indexed.request_no, submitted.requestNo);
});

void it('continues IDs above the Imported Requests when existing storage is upgraded', async () => {
  const draft = await fixture.draft();
  // A database from before integer IDs: an Imported Request and a Draft.
  await db.query(
    'ALTER TABLE psf_requests ALTER COLUMN numeric_id DROP NOT NULL, ALTER COLUMN numeric_id DROP DEFAULT',
  );
  await db.query(
    `INSERT INTO psf_requests (id, request_no, form_key, form_version, status, requester, requester_data_json, psf_created_data_json, schema_snapshot_json, created_at, updated_at)
     SELECT $1, 'PSF-005570', form_key, form_version, '10% -- Test Engineer Data Entry', 'Imported', '{"title":"Chip A"}', '{}', schema_snapshot_json, NOW() - INTERVAL '1 day', NOW()
     FROM psf_requests WHERE id = $2`,
    [randomUUID(), draft.id],
  );
  await db.query('UPDATE psf_requests SET numeric_id = NULL');

  await fixture.service.onModuleInit();

  const ids = (
    await db.query<{ request_no: string; numeric_id: number }>(
      'SELECT request_no, numeric_id FROM psf_requests ORDER BY numeric_id',
    )
  ).rows;
  assert.deepEqual(ids, [
    { request_no: 'PSF-005570', numeric_id: 5570 },
    { request_no: draft.requestNo, numeric_id: 5571 },
  ]);
  assert.equal((await fixture.draft()).numericId, 5572);
});

void it('keeps original file names in the request folder, suffixing duplicates, and records each upload', async () => {
  const draft = await fixture.draft();
  const listed = await fixture.attachments.upload(
    draft.id,
    [
      file('layout.dpl', 'one'),
      file('layout.dpl', 'two'),
      file('C:\\fakepath\\ผังชิป.png', 'png'),
    ],
    requester,
  );

  const folder = folderOf(draft);
  assert.deepEqual(await filesIn(folder), [
    'layout (1).dpl',
    'layout.dpl',
    'ผังชิป.png',
  ]);
  assert.equal(
    await readFile(join(root, folder, 'layout (1).dpl'), 'utf8'),
    'two',
  );
  assert.equal(listed.canManage, true);
  assert.deepEqual(
    listed.items
      .map((item) => [
        item.filename,
        item.sizeBytes,
        item.isImage,
        item.uploadedByDisplayName,
      ])
      .sort(),
    [
      ['layout (1).dpl', 3, false, 'Requester'],
      ['layout.dpl', 3, false, 'Requester'],
      ['ผังชิป.png', 3, true, 'Requester'],
    ],
  );
  const image = listed.items.find((item) => item.isImage)!;
  assert.equal(image.mimeType, 'image/png');
  const download = await fixture.attachments.download(
    draft.id,
    image.id,
    requester,
  );
  assert.equal(await readFile(download.path, 'utf8'), 'png');

  const current = await fixture.service.getRequest(draft.id, requester);
  assert.equal(current.updatedAt, draft.updatedAt);
  const uploads = (
    await fixture.service.getRequestHistory(draft.id, requester)
  ).filter((entry) => entry.actionType === 'ATTACHMENT_UPLOADED');
  // One upload shares a timestamp, so compare without order.
  assert.deepEqual(
    uploads
      .map((entry) => entry.metadata)
      .sort((a, b) => (String(a.filename) < String(b.filename) ? -1 : 1)),
    [
      {
        filename: 'layout (1).dpl',
        sizeBytes: 3,
        mimeType: 'application/octet-stream',
      },
      {
        filename: 'layout.dpl',
        sizeBytes: 3,
        mimeType: 'application/octet-stream',
      },
      { filename: 'ผังชิป.png', sizeBytes: 3, mimeType: 'image/png' },
    ],
  );
  assert.ok(uploads.every((entry) => !entry.hasRequestSnapshot));
});

void it('uses _[ID] while Product_Description is blank and renames the folder whenever it changes', async () => {
  const draft = await fixture.service.createDraft(
    { requesterData: { title: '' } },
    requester,
  );
  await fixture.attachments.upload(draft.id, [file('a.lay')], requester);
  assert.deepEqual(await filesIn(`_${draft.numericId}`), ['a.lay']);

  const named = await saveTitle(draft, 'Chip: A/B');
  const folder = `Chip_ A_B_${draft.numericId}`;
  assert.deepEqual(await filesIn(folder), ['a.lay']);
  assert.equal(await exists(join(root, `_${draft.numericId}`)), false);
  const [row] = (
    await db.query<{ relative_path: string }>(
      'SELECT relative_path FROM psf_request_attachments WHERE request_id = $1',
      [draft.id],
    )
  ).rows;
  assert.equal(row.relative_path, `${folder}/a.lay`);
  const listed = await fixture.attachments.list(draft.id, requester);
  assert.equal(listed.folderName, folder);
  // Still the uploaded row, not one rediscovered from the NAS.
  assert.equal(listed.items[0].uploadedByDisplayName, 'Requester');

  // Requester Information saves rename the folder of submitted work too.
  const submitted = await fixture.submit(named);
  await saveTitle(submitted, 'Chip B', ownerA);
  assert.deepEqual(await filesIn(`Chip B_${draft.numericId}`), ['a.lay']);
  assert.equal(await exists(join(root, folder)), false);
});

void it('refuses a rename onto an existing NAS folder and keeps the request unchanged', async () => {
  const draft = await fixture.draft();
  await fixture.attachments.upload(draft.id, [file('x.txt')], requester);
  await mkdir(join(root, `Taken_${draft.numericId}`));

  await assert.rejects(saveTitle(draft, 'Taken'), ConflictException);
  const current = await fixture.service.getRequest(draft.id, requester);
  assert.equal(current.requesterData.title, 'Test request');
  assert.equal(current.updatedAt, draft.updatedAt);
  assert.deepEqual(await filesIn(folderOf(draft)), ['x.txt']);
});

void it('lists files already in, added to or removed from the NAS folder directly', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  const folder = folderOf(submitted);
  // As for an Imported Request whose folder existed before the web app.
  await mkdir(join(root, folder));
  await writeFile(join(root, folder, 'E142.xml'), 'e142');
  await writeFile(join(root, folder, 'Thumbs.db'), 'cache');

  let listed = await fixture.attachments.list(submitted.id, requester);
  assert.deepEqual(
    listed.items.map((item) => [
      item.filename,
      item.sizeBytes,
      item.uploadedByDisplayName,
    ]),
    [['E142.xml', 4, null]],
  );

  await unlink(join(root, folder, 'E142.xml'));
  await writeFile(join(root, folder, 'job.lay'), 'lay');
  listed = await fixture.attachments.list(submitted.id, ownerB);
  assert.deepEqual(
    listed.items.map((item) => item.filename),
    ['job.lay'],
  );
  assert.equal(await rowCount(submitted.id), 1);
});

void it('shares Attachments across roles while Drafts stay private and Admin inspection read-only', async () => {
  const draft = await fixture.draft();
  const [uploaded] = (
    await fixture.attachments.upload(draft.id, [file('pcsf.pdf')], requester)
  ).items;

  await assert.rejects(
    fixture.attachments.list(draft.id, ownerA),
    ForbiddenException,
  );
  await assert.rejects(
    fixture.attachments.upload(draft.id, [file('x.txt')], ownerA),
    ForbiddenException,
  );
  const inspected = await fixture.attachments.list(draft.id, admin);
  assert.equal(inspected.canManage, false);
  assert.equal(inspected.items.length, 1);
  await fixture.attachments.download(draft.id, uploaded.id, admin);
  await assert.rejects(
    fixture.attachments.upload(draft.id, [file('x.txt')], admin),
    ForbiddenException,
  );
  await assert.rejects(
    fixture.attachments.delete(draft.id, uploaded.id, admin),
    ForbiddenException,
  );

  await fixture.submit(draft);
  const shared = await fixture.attachments.upload(
    draft.id,
    [file('dpl.dpl')],
    ownerB,
  );
  assert.equal(shared.canManage, true);
  assert.equal(shared.items.length, 2);
});

void it('deletes an Attachment from the NAS folder and records the deletion', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  const { items } = await fixture.attachments.upload(
    submitted.id,
    [file('keep.txt'), file('old.lay', 'old')],
    ownerA,
  );
  const old = items.find((item) => item.filename === 'old.lay')!;

  assert.deepEqual(
    await fixture.attachments.delete(submitted.id, old.id, requester),
    { deleted: true },
  );
  assert.deepEqual(await filesIn(folderOf(submitted)), ['keep.txt']);
  assert.equal(await rowCount(submitted.id), 1);
  await assert.rejects(
    fixture.attachments.download(submitted.id, old.id, requester),
    NotFoundException,
  );
  const [deletion] = (
    await fixture.service.getRequestHistory(submitted.id, requester)
  ).filter((entry) => entry.actionType === 'ATTACHMENT_DELETED');
  assert.equal(deletion.actorDisplayName, requester.displayName);
  assert.deepEqual(deletion.metadata, {
    filename: 'old.lay',
    sizeBytes: 3,
    mimeType: 'application/octet-stream',
  });
});

void it('removes the NAS folder of a permanently deleted Draft and never reuses its ID', async () => {
  const draft = await fixture.draft();
  await fixture.attachments.upload(draft.id, [file('a.txt')], requester);

  await fixture.service.deleteDraft(draft.id, draft.updatedAt, requester);
  assert.equal(await exists(join(root, folderOf(draft))), false);
  assert.equal(await rowCount(draft.id), 0);
  assert.equal((await fixture.draft()).numericId, draft.numericId + 1);
});

void it('rejects executables and files over ATTACHMENT_MAX_BYTES before writing anything', async () => {
  const draft = await fixture.draft();
  await assert.rejects(
    fixture.attachments.upload(
      draft.id,
      [file('ok.txt'), file('setup.EXE')],
      requester,
    ),
    BadRequestException,
  );
  const limited = new RequestAttachmentsService(
    fixture.pool,
    new AttachmentStorage({
      ATTACHMENT_STORAGE_PATH: root,
      ATTACHMENT_MAX_BYTES: '3',
    }),
    fixture.audit,
  );
  await assert.rejects(
    limited.upload(draft.id, [file('big.txt', 'four')], requester),
    PayloadTooLargeException,
  );
  assert.equal(await exists(join(root, folderOf(draft))), false);
  assert.equal(await rowCount(draft.id), 0);
});

void it('refuses Attachment work while storage is unreachable instead of dropping metadata', async () => {
  const draft = await fixture.draft();
  await fixture.attachments.upload(draft.id, [file('a.txt')], requester);
  const offline = new RequestAttachmentsService(
    fixture.pool,
    new AttachmentStorage({ ATTACHMENT_STORAGE_PATH: join(root, 'offline') }),
    fixture.audit,
  );

  await assert.rejects(
    offline.list(draft.id, requester),
    ServiceUnavailableException,
  );
  assert.equal(await rowCount(draft.id), 1);
});

void it('labels Audit History entries with Product_Description instead of the Draft number', async () => {
  const named = await fixture.service.createDraft(
    { requesterData: { title: 'Chip Z' } },
    requester,
  );
  const untitled = await fixture.service.createDraft(
    { requesterData: { title: '  ' } },
    requester,
  );
  await fixture.submit(named);

  const entries = await fixture.audit.findGlobalAuditLogs({}, requester);
  const labels = new Map(
    entries.map((entry) => [entry.requestId, entry.requestLabel]),
  );
  assert.equal(labels.get(named.id), 'Chip Z');
  assert.equal(
    labels.get(untitled.id),
    `Untitled Draft (#${untitled.numericId})`,
  );
  assert.equal(
    entries.find((entry) => entry.requestId === named.id)?.requestNo,
    `PSF-${String(named.numericId).padStart(6, '0')}`,
  );
});
