# Requester as a status email recipient verification — 21 October 2026

## Change and environment

Requested by Fook on 21 October 2026: a Work Status's email settings could only
hold typed addresses, so there was no way to email the person who made each
request. Decisions settled with Fook before building:

- Each status chooses whether the request's Requester is emailed: *Do not send*
  (default for every existing and new status), *To* or *CC*.
- The address is the creator's account email (from LDAP) at the moment the
  request enters the status. Imported Requests have only a Created By name and
  no account, so their Requester is not emailed; names are not matched.
- An enabled status needs a To: a typed address or the Requester in To. With the
  Requester in CC a typed To is still required.
- If the Requester has no usable address, the typed recipients still get the
  email; if To is then empty, CC moves to To; if nobody is left, no email is
  queued and a warning is logged.
- The setting applies whoever changes the Status. Only the Requester is added in
  this round; a Setup File Owner recipient was left out (requests have no
  assigned owner today).

Source:

- Policy shape and validation ([`workflow_transition.service.ts`](../../backend/src/admin/workflow_transition.service.ts),
  [`notification.types.ts`](../../backend/src/notifications/notification.types.ts)):
  optional `requester: 'to' | 'cc'`.
- Queuing ([`notification.service.ts`](../../backend/src/notifications/notification.service.ts)):
  reads `app_users.email` through `psf_requests.requester_user_id`.
- Edit status modal, catalog summary and Replace and delete preview
  ([`AdminWorkflowTransitionPage.tsx`](../../frontend/src/components/AdminWorkflowTransitionPage.tsx)).

Base `c761d9f` (main). Node 22.22.0. Chromium at `/opt/pw-browsers/chromium`
driven by Playwright from `backend/node_modules`, headless, light theme. Google
Fonts requests were answered with empty CSS.

Database: a throwaway PostgreSQL 16 cluster under `/tmp`, created for the run.
The configured database was not used. Both builds ran from an empty directory
with an explicit environment, `MAIL_ENABLED=false` (jobs stay pending in the
outbox) and the local development identities
([local development auth](../local-development-auth.md)). The development
Requester has no email, so `dev.requester@example.com` was written to its
`app_users` row to stand in for the LDAP address. No mail was sent.

## Test results

| Check | Command | Base `c761d9f` | Branch |
| --- | --- | --- | --- |
| Backend unit tests | `cd backend && npx jest` | 47 suites, 713 passed | 47 suites, 718 passed |
| API integration | `cd backend && npm run test:e2e` | — | 21 passed |
| Requester recipient (new, also in `npm run test:notifications:postgres`) | `node --require ts-node/register --test test/requester-email.postgres.test.ts` | the same file on base code does not compile (`requester` is not part of the policy) | 7 passed |
| Other PGlite suites | `node --require ts-node/register --test test/<name>.postgres.test.ts` | — | attachments 18, audit-visibility 8, autofill 15, draft-lifecycle 8, draft-reminders 9, initialize-data 2, modified-by 8, notifications 14, request-list 4, request-snapshot 12: all passed |
| Backend build | `cd backend && npx nest build` | Passed | Passed |
| Backend lint | `cd backend && npm run lint -- --no-fix` | 7 errors | the same 7 errors (Prettier, in unchanged lines) |
| Frontend tests | `cd frontend && npx vitest run` | 39 files, 527 passed | 39 files, 531 passed |
| Frontend build | `cd frontend && npm run build` | Passed | Passed |
| Frontend lint | `cd frontend && npm run lint` | 1 error | the same 1 error (`GlobalHistoryPage.test.tsx:389`) |
| Email system browser suite | `node --test --test-concurrency=1 test/email-system.e2e.mjs test/email-system.fixture.test.mjs test/psf-trigger-system.e2e.mjs`, run as the `postgres` user because embedded PostgreSQL refuses root | 4 passed, 5 failed | the same 4 passed, the same 5 failed |

After merging main at `d2100c3` (PR #95, Excel export) the suites were run
again: backend unit tests 739 on main, 744 on the branch, all passing; every
PGlite suite passes; frontend 527 on main, 531 on the branch; both builds pass
and lint is unchanged. API integration gives 16 of 21 on main and on the
branch: the five export tests fail on main itself with HTTP 500, because the
test's Excel export mock has no `tryDirectExport`, which the export controller
now calls. That is not touched here. After merging main at `325ef2b`, which
carries that fix (PR #101), API integration passes 21 of 21 on the branch;
backend unit tests (744) and the notification PGlite suites (21) still pass.

The new PGlite tests drive the real request, workflow and notification services
and read the queued jobs back through the outbox listing. They cover the
Requester in To on submission, in CC on a Status change, an account with no
email, CC moving to To, no recipient at all (the Status change still commits),
an Imported Request whose Requester name matches an account (not emailed), and
a status deletion whose two requests each email their own Requester. The CC,
CC-to-To and Imported Request tests were each checked to fail when the matching
line of `notification.service.ts` was disabled.

The status settings tests save the Requester in To and in CC and keep the
choice across a rename, and reject the Requester in CC without a typed To and
unknown values (`bcc`, `null`). Existing tests that statuses without the setting
read as *Do not send* and that public and non-admin audit views omit the whole
policy pass unchanged. The frontend tests save the Requester in To without a
typed To, refuse the Requester in CC without one, show the saved choice in the
catalog and the modal (disabled with *Do not send email on entry*), and name
"each request's Requester" in the Replace and delete preview.

The email system browser suite fails the same five flows on main and on the
branch in this environment: four on an unexpected browser console error
"503 (Service Unavailable)" checked after the flow, and the combined editor flow
on its `scrollWidth <= innerWidth` check. The Status Management page itself
scrolls horizontally by 475px at 390px wide on both builds (the status table),
which matches that check failing; it is not caused by this change and was not
fixed here.

## Browser and API checks

| Check | Base | Branch |
| --- | --- | --- |
| Edit status at 1440×900 | no Requester control | *Send to the Requester* select with help text above the address inputs; To legend reads "optional, the Requester is in To" when chosen ([before](assets/2026-10-21-requester-status-email/before-edit-status-desktop.png), [after](assets/2026-10-21-requester-status-email/after-edit-status-desktop.png)) |
| Edit status at 390×844 | Save visible at y 771–811 | Save visible at y 771–811 ([before](assets/2026-10-21-requester-status-email/before-edit-status-phone.png), [after](assets/2026-10-21-requester-status-email/after-edit-status-phone.png)) |
| Catalog row after saving Requester in To with CC `lead@example.com` | not possible | "Enabled · 0 To · 1 CC · Requester in To" ([row](assets/2026-10-21-requester-status-email/after-catalog-row.png)) |
| Replace and delete 30% into 10% | not possible | "To: each request's Requester", "CC: lead@example.com"; cancelled ([preview](assets/2026-10-21-requester-status-email/after-replace-and-delete-preview.png)) |
| Requester submits PSF-000001 into 10% (Requester in To, CC lead) | not run | queued To `dev.requester@example.com`, CC `lead@example.com` |
| Admin moves it to 20% (To `team@example.com`, Requester in CC) | not run | queued To `team@example.com`, CC `dev.requester@example.com` |
| Requester email cleared, admin moves it to 30% (Requester in To, CC lead) | not run | queued To `lead@example.com`, CC empty; Status changed; backend warned that the Requester has no usable email address |
| PSF-000001's `requester_user_id` set to null (as on an Imported Request), admin moves it into 10% (Requester in To, CC lead) | not run | queued To `lead@example.com`, CC empty; Status changed; no Requester warning logged |

The queued recipients were read from `GET /api/admin/notifications` as the
development Administrator. The flow ran twice (PSF-000001, then PSF-000002 after
the review changes) with the same recipients each time. Delivery through the company SOAP service was not
exercised.
