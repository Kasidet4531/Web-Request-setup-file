import { PGlite } from '@electric-sql/pglite';
import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';
import { after, before, beforeEach, it } from 'node:test';
import type { Pool } from 'pg';
import type { AuthenticatedUserProfile } from '../src/auth/session.types';
import { ExcelExportService } from '../src/export/excel_export.service';
import {
  admin,
  lifecycleFixture,
  ownerA,
  requester,
} from './draft-lifecycle.fixture';

// Saves go through the real RequestsService and the export reads the same
// database. The fixture's forms carry no exportable flags, like fields an
// administrator adds in the Form Builder.
let db: PGlite;
let fixture: Awaited<ReturnType<typeof lifecycleFixture>>;
let exporter: ExcelExportService;

before(
  async () => {
    db = new PGlite();
    const query = (sql: string, args?: unknown[]) => db.query(sql, args);
    fixture = await lifecycleFixture({
      query,
      connect: () => Promise.resolve({ query, release() {} }),
    } as unknown as Pool);
    exporter = new ExcelExportService(fixture.index, fixture.forms);
  },
  { timeout: 30000 },
);
after(async () => {
  await exporter.onModuleDestroy();
  await db.close();
});
beforeEach(() => fixture.reset());

async function exportRows(actor: AuthenticatedUserProfile) {
  const { content } = await exporter.exportRequests({}, actor);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    content as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.getWorksheet('PSF Requests');
  assert.ok(sheet);
  const headers = Array.from(
    { length: sheet.columnCount },
    (_, column) => sheet.getCell(1, column + 1).value as string,
  );
  return Array.from({ length: sheet.rowCount - 1 }, (_, row) =>
    Object.fromEntries(
      headers.map((header, column) => [
        header,
        sheet.getCell(row + 2, column + 1).value,
      ]),
    ),
  );
}

void it('exports fields without an exportable flag and the latest Modified By after each kind of save', async () => {
  const submitted = await fixture.submit(await fixture.draft());
  const edited = await fixture.service.updateDraftRequesterData(
    submitted.id,
    {
      formVersion: submitted.formVersion,
      expectedUpdatedAt: submitted.updatedAt,
      requesterData: { ...submitted.requesterData, title: 'Edited title' },
    },
    requester,
  );
  assert.deepEqual(
    (await exportRows(admin)).map((row) => [row.Title, row['Modified By']]),
    [['Edited title', requester.displayName]],
  );

  const { entries } = await fixture.workflow.getConfiguration();
  const next = entries.find(
    (entry) => entry.kind === 'open' && entry.name !== edited.status,
  );
  assert.ok(next);
  const moved = await fixture.service.updateRequestStatus(submitted.id, {
    actor: admin,
    status: next.name,
    expectedUpdatedAt: edited.updatedAt,
  });
  assert.equal((await exportRows(admin))[0]['Modified By'], admin.displayName);

  await fixture.service.updatePsfCreatedData(submitted.id, {
    actor: ownerA,
    expectedUpdatedAt: moved.updatedAt,
    psfCreatedData: { file: 'SETUP_A.psf' },
  });
  const [row] = await exportRows(admin);
  assert.equal(row['Modified By'], ownerA.displayName);
  assert.equal(row.File, 'SETUP_A.psf');
});
