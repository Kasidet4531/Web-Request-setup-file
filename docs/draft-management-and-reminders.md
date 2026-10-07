# Draft management, reminders and Product Type team filtering

This guide describes the 7 October 2026 implementation on `main`. See the
[approved spec](specs/2026-10-07-draft-lifecycle-and-product-team-filtering.md) and
[verification record](verification/2026-10-07-draft-lifecycle-and-team-filtering.md).

## Draft access and permanent deletion

My Drafts remains creator-scoped. Creators of every authenticated role can edit,
submit or permanently delete their own Drafts. Submitted requests cannot be
deleted through this feature.

Admin Draft Management provides searchable, paginated lists, read-only detail,
recipient issues and minimal deletion logs. Admins can permanently delete other
creators' Drafts but cannot edit or submit them. Ordinary users cannot inspect
foreign Drafts. Admin management is a separate read interface rather than an
exception granting general Draft mutation access.

Delete confirmation identifies the Draft and requires its latest opaque revision.
The transaction locks the request and checks state/role/revision. Concurrent
Submit/Delete has one committed winner. A stale revision requires review/refresh.

Permanent deletion removes form data/schema captures, canonical/search records,
old Draft audit metadata and request-linked outbox content. Reminder bookkeeping
cascades with deletion. Minimal deletion logs retain actor, Draft number and time
and are Admin-only. Shared History cannot recover erased private Draft payloads.

The server conservatively invalidates all cached export jobs belonging to that
Draft's creator because older jobs have no precise request-membership map. Their
content, filenames and claim tokens are cleared. Running jobs cannot complete
with their obsolete token. This may require the creator to regenerate an export;
it does not delete unrelated requests. Already downloaded Excel copies and emails
accepted by the external service cannot be recalled.

## Reminder rules

- Eligible at creation plus 168 hours while still Draft; Save does not reset age.
- Includes old overdue Drafts; one durable logical reminder per Draft.
- Creator is To; all current Admin addresses are CC. Normalize/deduplicate with
  To precedence. If creator email is missing, usable Admin addresses become To.
- Missing/invalid account addresses are visible in Admin Draft Management. Valid
  recipients still receive mail. If all are unusable, the item remains unresolved
  and a later scan can queue it after account correction.
- Queued recipients are a saved snapshot. Later account changes do not create a
  second scheduled reminder. Existing outbox retries apply to the same logical job.
- Content is Draft number, creator, created date/age and authorized links; it does
  not contain full requester/PSF form data. Display times use Asia/Bangkok.

`APP_BASE_URL` must be configured for links. `MAIL_ENABLED`, redirect/transport
configuration and the existing worker polling/retry rules remain in force.
Eligibility preparation runs while transport is paused; delivery does not.
All-missing recipients and missing base URL do not consume a successful queue.

Dispatch locks the request before validating the current outbox claim and holds
that lifecycle gate through transport/completion. Submit/Delete winning first
prevents stale delivery; dispatch winning first may finish before deletion commits.
The durable marker prevents duplicate logical jobs across scans/restart/workers.
External delivery remains at-least-once if acceptance succeeds but its database
acknowledgment fails.

Sources: [reminder module](../backend/src/notifications/draft-reminder.service.ts),
[worker](../backend/src/notifications/notification.worker.ts),
[Admin inspection](../backend/src/notifications/draft-reminders.controller.ts),
[request lifecycle](../backend/src/requests/requests.service.ts),
[Admin interface](../frontend/src/components/AdminDraftManagementPage.tsx).

## Assignment removal and team filtering

Request assignment controls/endpoints/inputs/response metadata, Owner/Dept Excel
columns and assignment history have been removed. Startup idempotently cleans
legacy assignment values and assignment-only metadata, preserving unrelated form,
request and status history. Cached pre-removal export artifacts are invalidated.
Account Setup File Owner role and GNTC/MFG department remain intact.

Dashboard defaults to the Setup File Owner's department group: New Product is
GNTC; Transfer Product and Existing Product are MFG. All teams and unclassified
work are selectable. Unknown/missing types display “รอระบุ Product Type”.
This is filtering only: both departments can edit each other's accessible shared
PSF work, and Admin rights remain unchanged. Grouping follows the latest saved
Product Type and preserves existing PSF values. Rows/totals/cards share one query;
Requester/Admin Dashboard remains creator-scoped, and Drafts stay out of shared
totals.

## Local verification commands

Use Node 24-compatible locked dependencies. Run `npm run test:drafts:system` from
the backend with `EMAIL_E2E_CHROME=/usr/bin/google-chrome` and an optional retained
`EMAIL_E2E_ARTIFACTS_DIR`. This builds both packages and uses the existing disposable
PostgreSQL/browser/LDAP/SOAP fixture, not configured company services.

Standalone Draft lifecycle/reminder SQL suites cover cleanup, seven-day boundaries,
rollback, independent worker claims and lifecycle locking. The dated verification
record lists exact commands and results.
