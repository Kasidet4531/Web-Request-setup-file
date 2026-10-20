/**
 * Read-only check of the request Attachment folders on the NAS: for every
 * request, is its `[Product_Description]_[ID]` folder where the app will look,
 * and which NAS folders would the app never find? Nothing is changed in the
 * database or on the NAS.
 *
 *   npm run attachments:check
 *   npm run attachments:check -- --csv report.csv          also write every finding
 *   npm run attachments:check -- --root Z:/attachment      instead of ATTACHMENT_STORAGE_PATH
 *
 * It also runs before the backend version with Request IDs has started: each
 * ID is then read from the request's PSF-NNNNNN number.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';
import { requestFolderName } from '../src/requests/attachment-storage';

type Db = Pick<PoolClient, 'query'>;

export interface FolderFinding {
  // renamed: the request's ID has a folder under another name, so the app
  // shows no files for it. duplicate: more than one folder ends with the ID.
  // unmatched: no request has the folder's ID.
  kind: 'renamed' | 'duplicate' | 'unmatched';
  requestNo: string | null;
  numericId: number | null;
  expected: string | null;
  found: string[];
}

export interface FolderReport {
  root: string;
  folders: number;
  requests: number;
  // Requests whose ID is not known yet (a Draft number before the upgrade).
  withoutId: number;
  matched: number;
  // Same name but for letter case: one folder on a Windows share.
  caseOnly: number;
  // No folder yet, as for a request with nothing attached.
  noFolder: number;
  renamed: number;
  duplicates: number;
  unmatchedFolders: number;
  findings: FolderFinding[];
}

const ID_SUFFIX = /_(\d+)$/;

export async function checkAttachmentFolders(
  db: Db,
  root: string,
): Promise<FolderReport> {
  const hasIds = (
    await db.query<{ has: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'psf_requests'
           AND column_name = 'numeric_id'
       ) AS has`,
    )
  ).rows[0].has;
  const requests = (
    await db.query<{
      request_no: string;
      numeric_id: number | null;
      title: string | null;
    }>(
      `SELECT request_no, requester_data_json->>'title' AS title, ${
        hasIds
          ? 'numeric_id'
          : `CASE WHEN request_no ~ '^PSF-[0-9]{1,9}$' THEN SUBSTRING(request_no FROM 5)::int END AS numeric_id`
      } FROM psf_requests ORDER BY request_no`,
    )
  ).rows;

  const folders = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const byId = new Map<number, string[]>();
  for (const folder of folders) {
    const id = ID_SUFFIX.exec(folder)?.[1];
    if (id === undefined) continue;
    byId.set(Number(id), [...(byId.get(Number(id)) ?? []), folder]);
  }

  const report: FolderReport = {
    root,
    folders: folders.length,
    requests: requests.length,
    withoutId: 0,
    matched: 0,
    caseOnly: 0,
    noFolder: 0,
    renamed: 0,
    duplicates: 0,
    unmatchedFolders: 0,
    findings: [],
  };
  const claimed = new Set<number>();
  for (const request of requests) {
    if (request.numeric_id === null) {
      report.withoutId++;
      continue;
    }
    const id = request.numeric_id;
    claimed.add(id);
    const expected = requestFolderName(request.title, id);
    const found = byId.get(id) ?? [];
    const finding = (kind: FolderFinding['kind']) =>
      report.findings.push({
        kind,
        requestNo: request.request_no,
        numericId: id,
        expected,
        found,
      });
    if (found.includes(expected)) report.matched++;
    else if (
      found.some((name) => name.toLowerCase() === expected.toLowerCase())
    )
      report.caseOnly++;
    else if (found.length === 0) report.noFolder++;
    else {
      report.renamed++;
      finding('renamed');
    }
    if (found.length > 1) {
      report.duplicates++;
      finding('duplicate');
    }
  }
  for (const folder of folders) {
    const id = ID_SUFFIX.exec(folder)?.[1];
    if (id !== undefined && claimed.has(Number(id))) continue;
    report.unmatchedFolders++;
    report.findings.push({
      kind: 'unmatched',
      requestNo: null,
      numericId: id === undefined ? null : Number(id),
      expected: null,
      found: [folder],
    });
  }
  return report;
}

function csv(findings: FolderFinding[]): string {
  const cell = (value: string | number | null) =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = findings.map((finding) =>
    [
      finding.kind,
      finding.requestNo,
      finding.numericId,
      finding.expected,
      finding.found.join(' | '),
    ]
      .map(cell)
      .join(','),
  );
  // The byte order mark lets Excel read Thai names as UTF-8.
  return `\uFEFF${['kind,request_no,id,expected_folder,found_folders', ...rows].join('\r\n')}\r\n`;
}

async function main() {
  const flags = process.argv.slice(2);
  const option = (name: string) => {
    const at = flags.indexOf(name);
    return at >= 0 ? flags[at + 1] : undefined;
  };
  try {
    process.loadEnvFile('.env');
  } catch {
    // Variables may come from the shell instead.
  }
  const root = option('--root') ?? process.env.ATTACHMENT_STORAGE_PATH?.trim();
  if (!root) {
    console.error(
      'Set ATTACHMENT_STORAGE_PATH in backend/.env or pass --root <folder>.',
    );
    process.exit(1);
  }
  const pool = new Pool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'psf_setup_db',
  });
  const client = await pool.connect();
  try {
    console.log(
      `Database: ${process.env.DB_HOST ?? '127.0.0.1'}/${process.env.DB_NAME ?? 'psf_setup_db'}; NAS folder: ${root}`,
    );
    await client.query('BEGIN TRANSACTION READ ONLY');
    const report = await checkAttachmentFolders(client, root);
    await client.query('ROLLBACK');
    const { findings, ...counts } = report;
    console.log(JSON.stringify(counts, null, 2));
    const renamed = findings.filter((finding) => finding.kind === 'renamed');
    if (renamed.length)
      console.log(
        `\nRequests whose files the app will not find (first ${Math.min(renamed.length, 20)} of ${renamed.length}):`,
      );
    for (const finding of renamed.slice(0, 20))
      console.log(
        `  ${finding.requestNo}: expects "${finding.expected}", NAS has "${finding.found.join('", "')}"`,
      );
    const file = option('--csv');
    if (file) {
      await writeFile(file, csv(findings), 'utf8');
      console.log(`\nAll ${findings.length} findings written to ${file}.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    console.error(
      code === 'ENOENT'
        ? 'The NAS folder cannot be found. A drive letter such as Z: exists only in the logon session that mapped it; run this where it is mapped, or pass the UNC path with --root.'
        : error instanceof Error
          ? error.message
          : error,
    );
    process.exit(1);
  });
}
