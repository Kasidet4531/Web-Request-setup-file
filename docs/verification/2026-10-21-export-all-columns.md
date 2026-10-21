# Every column in the Excel export verification — 21 October 2026

## Change and environment

Requested by Fook on 21 October 2026: the Excel export and the Export to Excel
page should show every column a request is made with. Decisions from the same
day: every field of every form version (including fields an administrator adds
and the grey fields of older versions), `NA` in any cell without a value (never
stored), Modified By always present as a system column, the preview shows the
file's first 10 rows with its total, Request No pinned, and PSF Created
Information shown in the export to every role before PSF Visibility Release
([ADR 0019](../adr/0019-excel-export-shows-every-field-to-every-role.md)).

- Export table shared by the workbook and the preview
  ([`export-table.ts`](../../backend/src/export/export-table.ts)): columns are
  Request No, Status, Request Date, Updated At, Modified By, then every
  requester field of the active and captured form versions by canonical key,
  then PSF Created Information. Cells are read from each request's current data
  through its own captured form version.
- Export query ([`search-index.service.ts`](../../backend/src/requests/search-index.service.ts)):
  no `canonical_submission_values` join, no role masking, and
  `queryExportSchemas` for the preview's columns.
- Export Preview API `GET /api/requests/export-preview`
  ([`export.controller.ts`](../../backend/src/export/export.controller.ts),
  [`excel_export.service.ts`](../../backend/src/export/excel_export.service.ts)).
- Export to Excel page ([`RequestExportPage.tsx`](../../frontend/src/components/RequestExportPage.tsx),
  [`request-export.ts`](../../frontend/src/services/request-export.ts),
  [`index.css`](../../frontend/src/index.css)).
- Base `d2100c3` (main, with the export speed work of PR #95). Node 22.22.0.
  Chromium 141 (`/opt/pw-browsers/chromium`) driven by Playwright from
  `backend/node_modules`, headless, 1440×900, light theme.
- Database: a throwaway PostgreSQL 16 cluster under `/tmp`, created for the run.
  The configured/shared database was not used. Both builds ran from an empty
  directory with an explicit environment and the local development identities
  ([local development auth](../local-development-auth.md)); mail was disabled.

### Local data

The branch build seeded the database through its API. An administrator
published requester form version 2 (the seeded form plus a text field "FPC")
and version 3 (without FPC, plus a number field "Bump Height (um)"); neither
added field has the `exportable` flag, as in the Form Builder. `requester`
submitted PSF-000001 and PSF-000002 on version 2 with FPC filled, and
PSF-000003 to PSF-000005 on version 3 (Bump Height 7.5, empty, 12.5).
`setup_owner_gntc` saved PSF Setup File Name and Job File Name on PSF-000001
and PSF-000003 (nothing released), and `admin` moved PSF-000004 to
"20% -- PSF File Creating". The base build then ran on the same database.

## Test results

| Check | Command | Base `d2100c3` | Branch |
| --- | --- | --- | --- |
| Backend unit tests | `cd backend && npx jest` | 49 suites, 739 passed | 50 suites, 745 passed |
| Export columns (file) | `npx jest src/export/excel_export.columns.spec.ts` | not in base | 5 passed: admin-added field, `NA` cells, Modified By after Updated At once across versions with and without the field, Requester sees PSF values |
| Export columns (database) | `node --require ts-node/register --test test/export-columns.postgres.test.ts` | the same file on base code: does not compile (no `previewRequests`); with type checks off, both tests fail | 2 passed: latest Modified By after a requester edit, a Status change and a PSF save; preview headers, first 10 rows and total equal the file for the same filters |
| All PGlite suites | `node --require ts-node/register --test --test-concurrency=1 test/*.postgres.test.ts test/check-attachment-folders.test.ts` | 101 tests, 100 passed, 1 skipped | 103 tests, 102 passed, 1 skipped (configured server only) |
| Export at scale | `runuser -u postgres -- node --require ts-node/register scripts/verify-export-scale.ts --sizes=780,5570` | — | 780 and 5,570 requests for admin, setup_owner and requester: every cell matches (423,396 cells at 5,570), identical files for all roles, 2.1–2.3 s per 5,570-row export |
| Backend build | `cd backend && npm run build` | Passed | Passed |
| Backend lint | `cd backend && npx eslint "{src,test,scripts}/**/*.{ts,mjs}"` | 9 errors | the same 9 errors (Prettier, in unchanged files) |
| Frontend tests | `cd frontend && npx vitest run` | 39 files, 527 passed | 39 files, 529 passed |
| Frontend type check | `cd frontend && npx tsc -b` | Passed | Passed |
| Frontend lint | `cd frontend && npx eslint .` | 1 error | the same 1 error (`GlobalHistoryPage.test.tsx:389`) |
| Frontend build | `cd frontend && npx vite build` | Passed | Passed |

## Browser and file checks

| Check | Base | Branch |
| --- | --- | --- |
| Preview columns | 5 (Request No., Title / Product Type, Status, Requester, Due Date) | the file's 27 columns, Request No pinned while the rest scroll |
| Preview count | "First 5 of 5 matching requests", may list fewer than the file | "First 5 of 5 requests in the file." |
| File columns | 24: no Modified By, no FPC, no Bump Height (um) | 27: Modified By after Updated At, the active form's fields ending with Bump Height (um), then FPC from version 2, then PSF Created Information |
| Empty cells | blank | `NA` |
| Modified By of PSF-000004 / PSF-000003 | no column | Development Administrator / Development Setup Owner GNTC |
| Requester's file, PSF-000003 PSF Setup File Name | blank (not released) | SETUP_2.psf |
| Admin's and Requester's files | differ in PSF cells | identical cells |

Screenshots: Export to Excel as Admin
[before](assets/2026-10-21-export-all-columns/before-admin.png) /
[after](assets/2026-10-21-export-all-columns/after-admin.png), scrolled to
[Bump Height and FPC](assets/2026-10-21-export-all-columns/after-admin-middle.png) and to
[PSF Created Information](assets/2026-10-21-export-all-columns/after-admin-scrolled.png);
as Requester [before](assets/2026-10-21-export-all-columns/before-requester.png) /
[after, scrolled](assets/2026-10-21-export-all-columns/after-requester-scrolled.png).

## Not verified

Deployment, the configured database, dark theme and phone widths. The
preview's column query reads every matching request's form snapshots: about
0.3 s at 5,570 requests and about 7 s at 100,000 on the local PostgreSQL 16
cluster; it was not measured on the configured server.
