# Email notifications

Implemented in `feat/email-notification`, based on the reviewed destination-status design. This guide describes local source behavior, not a company deployment or evidence of delivery to a real inbox.

## Status Management

Each work status has `emailPolicy = { enabled, to, cc }`. Existing statuses without a policy and newly created statuses default to off; Draft always stays off.

Admins open **Email policy** for a status, enter individual/group addresses and/or add existing users from the directory, then choose **Save email policy**. **Do not send email on entry** disables recipient controls while retaining saved values. To is required when enabled; CC is optional. Invalid directory addresses cannot be selected. Addresses are normalized and deduplicated, including removing To duplicates from CC.

Selecting a user stores their current email address. It is an address picker, not a dynamic role subscription: changing a user's email later does not rewrite status policies or queued jobs. Update the policy when recipients change.

Policy settings are admin-only. Public status responses omit recipient settings, and shared audit history hides recipient policies from requesters/setup owners while retaining ordinary catalog history. Admins retain full before/after recipient audit.

## Trigger rules

| Operation | Notification behavior |
| --- | --- |
| A → B | Use B's policy |
| Submit Draft to B | Use B's policy; one submission notification |
| Delete A and replace its requests with B | One status-change job per affected request using B's policy |
| Enter a status that has email off | No job and no fallback email |
| Save Draft, edit request data, rename a status, or choose the current status again | No notification |

Bulk replacement confirmation displays the destination's recipients and affected request count. Policy changes affect future events; existing jobs keep their original recipient, subject, body, request number and source/destination status snapshots. Turning a policy off does not cancel already-pending jobs.

From is always **`noreply-psf@nxp.com`**. Emails show safe requester metadata, captured canonical Title/Priority/Due Date fields, previous/new status and the actor's name/role. They never include PSF Created Information. The View Request link uses `APP_BASE_URL`; the existing frontend login redirect preserves the destination URL.

## Queue and delivery

`email_outbox` is an ordinary PostgreSQL table. Enqueue means inserting a pending row using the business transaction's connection. Disabled policies return before outbox SQL.

Notification preparation/INSERT uses a savepoint. Recoverable notification errors roll back only that savepoint and log the request/event error; successful request writes and other bulk jobs can still commit. If enqueue fails there is no job for the worker to retry, so that event may have no email. Failure of the business database connection or commit itself cannot be made successful by a savepoint.

Set `APP_BASE_URL` before enabling any status policy, including when dispatch is globally paused. Without it, enqueue logs an error and skips the email while leaving the request transition intact, rather than saving an unusable relative link.

The worker initializes outbox storage after request storage, polls every 15 seconds by default and atomically claims up to 10 jobs with `FOR UPDATE SKIP LOCKED`. SOAP calls run concurrently outside SQL transactions. Completion/failure writes require the current claim token; an old worker cannot overwrite a re-claimed job. Failed delivery retries after 1, 5, 15 and 60 minutes, with at most 5 attempts. Claims older than 5 minutes recover subject to the same attempt limit.

Exhausted non-alert jobs retain a durable `failure_alerted` marker. Each poll selects up to 10 unreported exhausted failures under row locks, inserts one admin summary and marks the source rows in the same transaction, without reading or including original email bodies. If alert creation fails, both changes roll back and later polls retry the obligation, including after process restart. Concurrent aggregators cannot report the same failure cycle twice. Failed-only resend resets this marker for a future failure cycle. Existing exhausted failures in an upgraded outbox start unreported and are summarized once when dispatch resumes. Failed alerts never generate more alerts. During a service outage, use logs and the admin API because alert emails can also fail.

`sent` means the SOAP endpoint accepted the request. It does not prove inbox delivery. Successfully enqueued jobs have at-least-once delivery semantics: a process/database failure after SOAP acceptance can cause a duplicate. Shutdown hooks drain active dispatch before the database pool closes.

## Configuration

Start from [backend/.env.example](../backend/.env.example). Do not commit real credentials or mailbox configuration.

| Variable | Purpose/default |
| --- | --- |
| `MAIL_ENABLED` | `false` by default; pause dispatch while retaining pending jobs for enabled statuses |
| `MAIL_SOAP_URL` | Company SendMail SOAP URL; accessed only when dispatch is enabled |
| `MAIL_SYSTEM_NAME` | `PSF Setup File` |
| `MAIL_SMTP_SERVER`, `MAIL_SMTP_PORT` | Relay parameters in the SOAP payload; port defaults to 25 |
| `MAIL_DEFAULT_TO` | Admin failure alerts; required when dispatch is enabled |
| `MAIL_ADMIN_TO` | Optional admin-test destination override; defaults to `MAIL_DEFAULT_TO` |
| `MAIL_REDIRECT_TO` | Required for non-production dispatch; supports multiple test recipients |
| `MAIL_POLL_INTERVAL_MS` | 15000; positive and at most 300000 |
| `MAIL_TIMEOUT_MS` | 10000; positive and at most 120000, including response body consumption |
| `APP_BASE_URL` | Absolute frontend URL for immutable email deep links; production rejects loopback URLs |

From is fixed, not configurable through `MAIL_FROM`. When enabled, startup validates SOAP/SMTP/admin/base URL settings. A non-production process cannot enable delivery without redirect recipients.

Redirect applies at send time: actual To becomes `MAIL_REDIRECT_TO`, actual CC/BCC are empty, subject gets `[TEST]` and a banner identifies intended recipients. Original database recipient/subject/body fields stay unchanged; `sentTo` records actual recipients.

Environment changes require restarting the backend. Changing `MAIL_ENABLED` from false to true resumes the entire pending backlog; old jobs are not discarded. Review the backlog and keep redirect active while testing.

## Admin API

All routes use the existing session and a freshly loaded admin role. Missing/invalid sessions return 401; non-admin profiles return 403.

| Route | Behavior |
| --- | --- |
| `GET /api/admin/notifications` | Paginated summaries, no body; page default 1, limit default 20/max 100; optional `status` and `isFallback` filters |
| `POST /api/admin/notifications/:id/resend` | Atomic failed-only reset, attempts 0; returns updated summary; 400 for other states, 404 if missing |
| `POST /api/admin/notifications/test` | Fixed template and configured destination, no arbitrary caller HTML/recipients; rejects globally disabled delivery |

List summaries use camelCase fields such as `eventType`, `requestId`, `fromAddress`, `to`, `cc`, `sentTo`, `status`, `attempts`, `lockedAt` and `lastError`. Admin test records are inserted already claimed before immediate dispatch so the worker cannot race the test endpoint.

There is no new monitoring UI in this scope; Status Management is the UI change, and delivery monitoring is available through the API/logs.

## Offline verification and LAN check

Run from `backend`:

```sh
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:notifications:postgres
npm run build
npm run lint -- --no-fix
```

The notification PostgreSQL suite uses isolated in-memory PGlite by default. To additionally exercise real multi-connection locking, set `NOTIFICATION_TEST_DATABASE_URL` to a **local** PostgreSQL database whose name starts with `notification_test`. The suite creates/drops its own temporary schema, never reads configured application DB credentials, and rejects non-loopback hosts. Example:

```sh
NOTIFICATION_TEST_DATABASE_URL=postgresql://postgres:local-test-password@127.0.0.1:5432/notification_test npm run test:notifications:postgres
```

Run `npm test`, `npm run build` and `npm run lint` from `frontend`. Browser QA can use mocked admin profile/catalog/directory APIs; no LDAP or company backend is needed. SOAP fixtures cover namespace-aware empty success, faults including HTTP 200 faults, invalid XML/DTD, XML/CDATA escaping, redirection and timeouts.

Real SOAP/relay acceptance of `noreply-psf@nxp.com` and inbox delivery remain a LAN-only check. Use the admin test endpoint with redirect recipients inside the company's permitted environment. No real company SOAP, LDAP or database was used during this implementation.

Source: [status policies](../backend/src/admin/workflow_transition.service.ts), [request hooks](../backend/src/requests/requests.service.ts), [notification module](../backend/src/notifications/notifications.module.ts), [Status Management](../frontend/src/components/AdminWorkflowTransitionPage.tsx).

## Local verification — 2026-10-05

| Check | Result |
| --- | --- |
| Backend Jest, after independent review fixes | 43 suites / 682 tests passed |
| API integration (mock database/profile) | 20 tests passed |
| Frontend Vitest | 34 files / 415 tests passed |
| Isolated notification SQL, after independent review fixes | 14 PGlite tests plus 4 real local PostgreSQL multi-connection tests passed |
| Backend and frontend builds/lint | Passed |
| Chrome UI with mocked APIs | 1440×1000 and 390×844; manual/system recipients, suppression, Save/Cancel/focus and bulk preview passed; no app console errors |

Browser checks used the bundled Playwright runtime and system Chrome because the Browser plugin was unavailable. The public Google Fonts stylesheet was mocked with local font fallback to keep the browser check offline. UI evidence is local at `/tmp/psf-email-ui-qa/`; the temporary HTTP server and PostgreSQL cluster were stopped after checks. Fresh reviews of policy/UI found audit-recipient exposure and invalid directory/focus issues; regression tests and browser checks verify their fixes.

After the user reset delegated review capacity, fresh independent whole-feature quality and spec reviews completed with `gpt-6.1-sol` / high. They identified lost alert-creation obligations and production local-URL normalization gaps (IPv4-mapped loopback and trailing-dot localhost). Those findings were fixed with regression tests, then independently cross-reviewed. No blocking findings remain. A nonblocking recommendation to reduce duplication in recipient validation remains advisory. Backend/E2E/SQL/build/lint were rerun on the final fixes; frontend/UI had no source changes after their fresh successful run. Real company connectivity remains untested.
