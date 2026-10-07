# Draft lifecycle implementation plan

Spec: [Draft lifecycle and Product Type team filtering](../specs/2026-10-07-draft-lifecycle-and-product-team-filtering.md).
Execution requested with `/implement`; no issue publication is needed.
Work only in the existing `main` checkout, starting from `43f6d6a`.

## Shared contracts

- Admin Draft list: `GET /api/admin/drafts`, with keyword/creator/productType,
  limit and offset; `{ items, total, limit, offset }`. Items include requestId,
  requestNo, title, requester/requesterUserId, productType, createdAt and opaque
  updatedAt. Detail: `GET /api/admin/drafts/:id` returns the usual request shape
  with all foreign-Draft mutation capabilities false.
- Delete: `DELETE /api/requests/:id` with `{ expectedUpdatedAt }`; creator/Admin
  only, Draft only, revision/state checked under a transaction lock. Returns
  `{ deleted: true }`. Minimal deletion history is Admin-visible only.
- Reminder inspection: `GET /api/admin/draft-reminders` returns
  `{ items: [{ requestId, requestNo, state, queuedAt, skippedRecipients }] }`.
  Skipped entries contain userId/displayName/reason. Admin only.
- Reminder bookkeeping table `draft_reminders`, request_id is unique and cascades
  on request deletion. Delete purges all request-linked outbox content before
  deleting the request. Reminder dispatch and Submit/Delete coordinate on the
  request row; a dispatch winner may finish before deletion commits.
- Dashboard query adds `team: 'all' | 'GNTC' | 'MFG' | 'unclassified'`;
  no request assignment inputs/outputs or assigned/department relationships.
  Team is filtering, never PSF authorization.

## Tasks and file ownership

1. Backend lifecycle worker owns Requests/Audit/SearchIndex/Export code and
   related tests: Admin reads/list, creator/Admin hard deletion, payload cleanup,
   cached-export invalidation, assignment removal and team predicates. Keep
   account role/department intact. Register its Admin controller in RequestsModule.
2. Reminder worker owns Notifications code/new reminder storage and controller,
   worker dispatch gating and related tests. NotificationsModule exports needed
   capabilities without depending on RequestsModule. A separate DRAFT_REMINDER
   event uses the existing mail transport and policy-independent recipient logic.
3. Frontend worker owns browser interfaces/types/routes/styles and tests: Admin
   Draft Management, My Draft Delete, readonly management detail, reminder issues,
   assignment removal and Dashboard team filters.
4. Parent integrates contracts/docs and executes public-system browser/HTTP/mail
   checks with disposable data. Independent Standards + Spec review precedes
   the final commit. Do not push without user instruction.

## Verification and completion

- [x] Observe focused RED/GREEN at confirmed public/module seams.
- [x] Regularly run focused tests and typechecking/builds.
- [x] Verify seven-day/once behavior, recipients, deletion/privacy/export cleanup,
      races, removed assignment and cross-team editing/grouping.
- [x] Run full suites and inspect desktop/mobile light/dark screenshots.
- [x] Resolve Standards and Spec findings, record evidence and commit on main.

## Completion evidence

See [verification](../verification/2026-10-07-draft-lifecycle-and-team-filtering.md)
for final commands/results, review resolution and retained screenshots. The
implementation also fences/purges old Draft failure-summary copies; existing
ordinary notification failure summaries remain unchanged.
