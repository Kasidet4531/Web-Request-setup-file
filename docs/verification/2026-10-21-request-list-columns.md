# Request list columns and Modified By verification — 21 October 2026

## Change and environment

Requested by Fook on 21 October 2026, with the form field sheet: the request
list's first column should be Product Description, each column should hold one
value, PSF Setup File Name and Job File Name should be added, and Modified By
should be filled in by the system.

- Request tables ([`RequestsWorkspace.tsx`](../../frontend/src/components/RequestsWorkspace.tsx),
  widths in [`index.css`](../../frontend/src/index.css) and
  [`ux-polish.css`](../../frontend/src/ux-polish.css)). Requests and Dashboard:
  Product Description, Request No., Product Type, Status, PSF Setup File Name,
  Job File Name, Due Date, Requester. My Drafts: Product Description,
  Request No., Product Type, Updated, Delete.
- List API and search index ([`search-index.service.ts`](../../backend/src/requests/search-index.service.ts)):
  `jobFileName` beside `psfSetupFileName`, both hidden from a Requester until
  PSF Visibility Release; one-time indexing of existing requests
  (`index-psf-file-names-v1`).
- Modified By ([`requests.service.ts`](../../backend/src/requests/requests.service.ts)):
  recorded on every individual save regardless of the form; one-time fill of
  blank values from Audit History (`modified-by-from-audit-history-v1`).
- Base `9a051ff` (main). Node 22.22.0. Chromium 141 (`/opt/pw-browsers/chromium`)
  driven by Playwright from `backend/node_modules`, headless, 1440×900 and
  900×900, light theme. Google Fonts requests were answered with empty CSS.
- Database: a throwaway PostgreSQL 16 cluster under `/tmp`, created for the run.
  The configured/shared database was not used. Both builds ran from an empty
  directory with an explicit environment and the local development identities
  ([local development auth](../local-development-auth.md)); mail was disabled.

### Local data

The base build seeded the database through its API, on the seeded forms (whose
requester form has no Modified By field): three requests submitted by
`requester`; PSF-000001 with PSF Created Information saved by
`setup_owner_gntc`, PSF-000002 with its title edited by `setup_owner_gntc`,
PSF-000003 with PSF Created Information saved by `admin` (a 49-character PSF
Setup File Name), and one Draft. The branch build then started on the same
database, so its one-time steps ran on data written by the base build.

## Test results

| Check | Command | Base `9a051ff` | Branch |
| --- | --- | --- | --- |
| Backend unit tests | `cd backend && npx jest` | 47 suites, 713 passed | 47 suites, 713 passed (expectations now include Modified By) |
| Modified By | `node --require ts-node/register --test test/modified-by.postgres.test.ts` | the same file on base code: 6 of 8 fail | 8 passed |
| Request list | `node --require ts-node/register --test test/request-list.postgres.test.ts` | the same file on base code: does not compile (no `jobFileName`) | 3 passed |
| Other PGlite suites | `node --require ts-node/register --test test/<name>.postgres.test.ts` | — | attachments 15, audit-visibility 8, autofill 15, draft-lifecycle 8, draft-reminders 9, initialize-data 2, notifications 14, request-snapshot 12 (1 skipped, configured server only): all passed |
| Backend build | `cd backend && npx nest build` | Passed | Passed |
| Backend lint | `cd backend && npx eslint "{src,test}/**/*.{ts,mjs}"` | 7 errors | the same 7 errors (Prettier, in unchanged lines) |
| Frontend tests | `cd frontend && npx vitest run` | 38 files, 523 passed | 39 files, 527 passed |
| Frontend type check | `cd frontend && npx tsc -b --force` | Passed | Passed |
| Frontend lint | `cd frontend && npx eslint .` | 1 error | the same 1 error (`GlobalHistoryPage.test.tsx:389`) |
| Frontend build | `cd frontend && npx vite build` | Passed | Passed |

The Modified By tests run on a requester form without a Modified By field and
cover Draft creation, a requester edit by another actor, a Modified By sent in
form data (ignored), a Status change, a PSF Created Information save, the
Audit History fill and keeping an already recorded value. On base code the
five save tests and the Audit History fill fail (`undefined` instead of the
actor); the form check and keeping a recorded value pass.

## Browser checks

| Check | Base | Branch |
| --- | --- | --- |
| Request header of PSF-000002 after the owner's edit | Modified By "—" | Modified By "Development Setup Owner GNTC" (filled from Audit History at startup) |
| A new Status change by `admin` on PSF-000001 (form without a Modified By field) | not run | Modified By "Development Administrator" |
| Requests as Admin | first column stacks title, number and Product Type; no PSF file names | one value per column; PSF Setup File Name and Job File Name shown, "—" where none |
| Requests and Dashboard as Requester (nothing released) | no PSF file names | PSF file names "—" |
| Search index after first start | `job_file_name` column absent; `psf_setup_file_name` empty (field not searchable in the seeded form) | both names indexed for PSF-000001 and PSF-000003 |
| Typical row height | 89px (Requests), 69–71px (Dashboard) | 69px on both; `ROW_PX` updated |

At 900px the Requests table scrolls horizontally inside its region (minimum
width 1120px). Long file names break inside their cell. Long Status names keep
the existing truncation with the full name in the Status disclosure.

Screenshots: Requests as Admin [before](assets/2026-10-21-request-list-columns/before-requests-admin.png) /
[after](assets/2026-10-21-request-list-columns/after-requests-admin.png); Requests as Requester
[after](assets/2026-10-21-request-list-columns/after-requests-requester.png); Dashboard
[before](assets/2026-10-21-request-list-columns/before-dashboard-requester.png) /
[after](assets/2026-10-21-request-list-columns/after-dashboard-requester.png); My Drafts
[before](assets/2026-10-21-request-list-columns/before-my-drafts.png) /
[after](assets/2026-10-21-request-list-columns/after-my-drafts.png); Requests at 900px
[after](assets/2026-10-21-request-list-columns/after-requests-admin-narrow.png); request header
[before](assets/2026-10-21-request-list-columns/before-detail-header.png) /
[after](assets/2026-10-21-request-list-columns/after-detail-header.png).

## Not verified

Deployment, the configured database, dark theme and phone widths. Requests whose
Modified By is blank and that have no saved Audit History entry, such as
requests imported on 8 October 2026 without Modified By, stay blank until their
next save.
