# Status type wording and 100 demo requests — 2026-10-02

> **Historical verification record (2026-10-02 audit):** Results, test counts, authorizations, fixtures, environment paths and limitations below are preserved as evidence of that scoped run. They are not fresh verification of this checkout, its running services or the current database contents, and do not authorize replaying data changes. Use [Current implementation](../current-implementation.md) for the present source baseline.

## Authorized scope

The user requested `Meaning` → `Status type`, visible `Cancelled` → `Cancel`, removal of unused old test data, and approximately 100 new request records for UI inspection.

- Source changes are confined to the canonical frontend component and its existing test. No production/development authentication or backend contract changes.
- The existing internal `cancelled` enum remains unchanged. The select option and catalog table display `Cancel`; both headers use `Status type`.
- Database changes target the current local development runtime's `psf_setup_db.public` request data, not a disposable copy. Users, form definitions, autofill rules, and workflow configuration are preserved.

## UI verification

- Focused test first failed on the old `Meaning` label, then passed after the minimal component edit.
- `npm run lint`: passed.
- `npm test`: 231 tests across 26 files passed.
- `npm run build`: TypeScript and production build passed.
- Live authenticated frontend at port 5199 displayed the `Status type` label/header and `Cancel` select/table text; the select still uses the API value `cancelled`.
- Status Management control visible at 1920, 1440, 1024, and 390px. Desktop main/root overflow was zero. At 390px the existing main-pane overflow is 179px, unchanged by a DOM-only negative control restoring all changed labels. That pre-existing responsive issue is outside this text/data task and remains deferred; this is not a claim of mobile-layout acceptance.

## Request replacement and actual database evidence

- A protected backup was read back before deletion. The reset used a transaction, a fixed six-ID baseline, request-table locks, no `CASCADE`/`TRUNCATE`, and stopped on baseline/protected-table drift.
- Removed six old requests and their 50 canonical values, five search-index rows, and 23 linked request audit entries. No export jobs existed; global/configuration audit records were not targeted.
- Created and read back exactly 100 new non-Draft requests through the ordinary authenticated create/submit/PSF-save APIs, using the actual active requester v2 and PSF v1 schemas and exact six-digit optimistic revisions. No direct SQL insertion of synthetic request rows.
- Data covers all 16 configured work statuses; the protected Draft status remains available but was not seeded, so All Requests displays the full 100 records.
- Requesters use the four existing closed development identities. Each record has populated requester and PSF fields, valid due dates, varied choices/priorities/products, and an actual backend-generated audit history.
- Owner departments: 50 GNTC, 50 MFG.
- Read-only SQL confirmed 100 request rows, 100 index rows, 1,000 canonical values, 300 audit entries, absence of all six old IDs, and canonical/audit coverage for every new request.
- Protected table counts/hashes remained equal before/after, excluding only the existing user-profile `updated_at` field refreshed by normal development login.
- All-scope API: total 100, 100 unique loaded IDs, open 88, overdue 46, completed 6; six additional requests have the cancel kind.
- Live All Requests displayed `100 request(s)`; a populated detail rendered without the reported error. The Administrator's related Dashboard correctly used its 25 related requests (19 open, 10 overdue, 0 completed), not the all-scope total.

## Retained evidence and boundaries

Protected backup and replay/evidence files were copied with byte/hash verification to `/opt/data/backups/Web-Request-setup-file/2026-10-02-status-demo-100/` (directory 0700; files 0600), including `requests-before.json`, `seed-result.json`, `seed-progress.jsonl`, `database-verification.json`, and the scratch reset/seed programs. These avoid scratch expiry and contain no runtime credential dump.

The seed program is intentionally a one-shot local operation: it refuses existing progress rather than duplicating partially created records. Its captured runtime PID/schema baseline is not a generic production seeder.

The browser was unauthenticated during an initial follow-up check; re-login through the existing development UI completed the bounded authenticated checks. No authentication policy was changed. Existing frontend and backend runtimes remain running. No frontend/config/auth synchronization into `local-test-auth`, no push, and no remote-LAN reachability claim.
