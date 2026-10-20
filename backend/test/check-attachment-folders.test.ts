import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, it } from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { checkAttachmentFolders } from '../scripts/check-attachment-folders';
import { lifecycleFixture, requester } from './draft-lifecycle.fixture';

let db: PGlite;
let root: string;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;
const client = () =>
  ({
    query: (sql: string, values?: unknown[]) => db.query(sql, values),
  }) as unknown as PoolClient;

before(
  async () => {
    root = await mkdtemp(join(tmpdir(), 'psf-folder-check-'));
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
  await db.close();
  await rm(root, { recursive: true, force: true });
});

const draft = (title: string) =>
  fixture.service.createDraft({ requesterData: { title } }, requester);

void it('reports which requests the app will find a NAS folder for, and which folders it never will', async () => {
  const matched = await draft('Chip A');
  const caseOnly = await draft('Chip B');
  const renamed = await draft('A/B');
  const empty = await draft('Chip D');
  for (const folder of [
    `Chip A_${matched.numericId}`,
    `Chip A old_${matched.numericId}`,
    `chip b_${caseOnly.numericId}`,
    // Saved on the NAS without the "/", where the app expects "A_B".
    `AB_${renamed.numericId}`,
    'Misc',
    'Old project_99999',
  ])
    await mkdir(join(root, folder));
  await writeFile(join(root, 'readme.txt'), 'not a folder');

  const report = await checkAttachmentFolders(client(), root);

  const { findings, ...counts } = report;
  assert.deepEqual(counts, {
    root,
    folders: 6,
    requests: 4,
    withoutId: 0,
    matched: 1,
    caseOnly: 1,
    noFolder: 1,
    renamed: 1,
    duplicates: 1,
    unmatchedFolders: 2,
  });
  // Folder listing order differs between file systems.
  const sorted = (names: string[]) => [...names].sort();
  type Sortable = { kind: string; found: string[] };
  const byKindAndFolder = (a: Sortable, b: Sortable) =>
    `${a.kind}:${a.found[0]}`.localeCompare(`${b.kind}:${b.found[0]}`);
  assert.deepEqual(
    findings
      .map((finding) => ({ ...finding, found: sorted(finding.found) }))
      .sort(byKindAndFolder),
    [
      {
        kind: 'duplicate',
        requestNo: matched.requestNo,
        numericId: matched.numericId,
        expected: `Chip A_${matched.numericId}`,
        found: sorted([
          `Chip A_${matched.numericId}`,
          `Chip A old_${matched.numericId}`,
        ]),
      },
      {
        kind: 'renamed',
        requestNo: renamed.requestNo,
        numericId: renamed.numericId,
        expected: `A_B_${renamed.numericId}`,
        found: [`AB_${renamed.numericId}`],
      },
      ...['Misc', 'Old project_99999'].map((folder) => ({
        kind: 'unmatched',
        requestNo: null,
        numericId: folder === 'Misc' ? null : 99999,
        expected: null,
        found: [folder],
      })),
    ].sort(byKindAndFolder),
  );
  assert.ok(!findings.some((finding) => finding.requestNo === empty.requestNo));
});

void it('reads each ID from the PSF number on a database from before Request IDs', async () => {
  const legacy = new PGlite();
  await legacy.exec(`
    CREATE TABLE psf_requests (request_no text, requester_data_json jsonb);
    INSERT INTO psf_requests VALUES
      ('PSF-000100', '{"title": "Chip A"}'),
      ('PSF-000101', '{"title": "Chip/B"}'),
      ('DRAFT-20261020-0001', '{"title": "New"}');
  `);
  const legacyRoot = await mkdtemp(join(tmpdir(), 'psf-folder-check-'));
  await mkdir(join(legacyRoot, 'Chip A_100'));
  await mkdir(join(legacyRoot, 'Chip_B_101'));
  try {
    const { findings, ...counts } = await checkAttachmentFolders(
      {
        query: (sql: string) => legacy.query(sql),
      } as unknown as PoolClient,
      legacyRoot,
    );
    assert.equal(counts.requests, 3);
    assert.equal(counts.withoutId, 1);
    assert.equal(counts.matched, 2);
    assert.deepEqual(findings, []);
  } finally {
    await legacy.close();
    await rm(legacyRoot, { recursive: true, force: true });
  }
});
