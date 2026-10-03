# Connected backend review — 2026-10-03

## Runtime and authorization

The user authorized starting the configured development backend, including its existing storage initialization, and requested review against PostgreSQL data. Backend runs on port 3000; the frontend on `http://127.0.0.1:5173` proxies `/api` to it. The Codex browser is authenticated through the existing development Admin sign-in. This is a server session backed by `app_users`; application records, status catalog and form schemas come from PostgreSQL.

The temporary synthetic gateway on port 4174 was stopped and its script deleted. All six browser scripts that installed or relied on preview fixtures were removed. A fresh `psf-live` Playwright session used no route interception. Historical fixture screenshots/results remain dated evidence, not active runtime data. Unit-test fixtures remain part of automated regression testing.

Company LDAP authentication was not exercised. No request, schema, status, autofill rule or user permission was edited during browser verification. Backend startup and development Admin login performed their existing authorized initialization/profile operations.

## Checks and evidence

- `GET /api/health` through the frontend returned 200, application `backend`, database `up`.
- A read-only PostgreSQL transaction confirmed connection to the configured development database, PostgreSQL 15.19.
- Fourteen screens at 1384×685 and 390×844: Dashboard, All PSF Requests, Create, My drafts, Users, both form families, Status Management, Auto-fill Rules, Export preview, global audit, request detail, request history and active schema editor.
- All 28 renders had a visible heading, no unexpected alert and no body horizontal overflow. Mobile tables retained local horizontal scrolling.
- 152 observed API responses succeeded; no page exception or console error during the screen matrix.
- Loaded queue: 100 submitted requests. Maximum observed title 33 characters, status 71 characters, owner 28 characters and request number 19 characters. The 71-character status was also checked in detail at both sizes and displayed in full in the current-status label without page overflow.
- Keyword search returned the expected single matching database row.
- Database-backed creation form had 13 controls; captured request detail had 24 controls. Active requester schema was version 2; the PSF information family was read independently.
- Latest frontend checks after browser feedback: 300 tests in 30 files passed, lint passed, TypeScript/Vite production build passed; `git diff --check` passed.

Database screenshots are deliberately kept outside the repository under `/private/tmp/psf-live-*.png`. The synthetic screenshots retained in `verification/screenshots` are from the earlier run. No credentials, session cookies or database record exports are committed.

## Browser feedback applied

- Removed the Create page's **Before you submit** help sidebar and its obsolete two-column layout styles. The form now uses the available page width.
- Removed the page-header **Export to Excel** shortcut from **My drafts**. The existing authorized export page and All PSF Requests shortcut remain available.

## Existing database demo records

A read-only count found 102 requests, including 101 whose title matches `DEMO-% | Probe setup product %`. The user confirmed these existing database DEMO records are intentional data for testing the whole system and must be retained. No database DEMO records were deleted. Cleanup applies to the removed browser preview fixtures and temporary gateway; the connected frontend uses the existing database records, schemas and status catalog.

This check confirms connected rendering, reading, filtering and current data dimensions. Saving/submitting requests, schema publication, status changes, backend workbook generation and company LDAP success are outside this read-only review.
