# Draft reminders, Draft Management and Product Type team filtering

Requirements confirmed through three interview rounds on 7 October 2026.
Testing scope confirmed in chat on the same date. Source baseline: `main` at
`43f6d6a`. This is a specification, not a statement of implemented behavior.

## Problem Statement

Unsubmitted Drafts can remain unnoticed indefinitely. Their creators and Admins
need a reminder after seven days, and a way to remove unwanted Drafts permanently.
Admins currently cannot inspect other users' Drafts to manage them, and creators
have no Delete action in My Drafts.

Manual Owner/Dept assignment adds administration that the team no longer wants.
GNTC and MFG need Dashboard grouping based on Product Type while retaining their
ability to work on each other's PSF Requests.

## Solution

- Send one logical reminder per Draft when it remains unsubmitted for at least
  seven days from creation. Include existing overdue Drafts. Address the creator
  and all current Admin accounts together; send to usable addresses and expose
  missing/invalid recipients for Admin inspection.
- Add Admin Draft Management with a Requests-like list, read-only detail and
  permanent Delete. Add Delete to creators' My Drafts. Submitted requests cannot
  be deleted through either capability.
- Permanently remove deleted Draft content and its prior history, retaining only
  a minimal Admin-visible deletion log. Cancel unsent reminder work and purge
  application-retained copies of the Draft's content.
- Remove request assignment throughout the interface, contracts, Excel and
  stored assignment data/history. Keep account roles and departments.
- Group shared Dashboard work by the latest saved Product Type:

| Product Type | Dashboard team group |
| --- | --- |
| New Product | GNTC |
| Transfer Product | MFG |
| Existing Product | MFG |
| Missing or unrecognized | รอระบุ Product Type |

Team grouping is a filter, not an authorization rule. GNTC/MFG Setup File Owners
may still view and edit each other's shared PSF work under existing permissions.

## User Stories

1. As a Draft creator, I want a reminder after my Draft reaches seven days, so that I remember to submit or delete it.
2. As a Draft creator, I want the reminder age measured from creation, so that later saves do not silently postpone it.
3. As a Draft creator, I want one logical reminder rather than recurring reminders, so that an unfinished Draft does not generate repeated scheduled mail.
4. As a Draft creator, I want old overdue Drafts included when the feature starts, so that existing unfinished work is not overlooked.
5. As an Admin, I want to receive Draft reminders alongside their creators, so that I can identify unattended Drafts.
6. As an Admin, I want recipient selection based on current Admin accounts, so that a separate group-address configuration is unnecessary.
7. As a recipient who is both creator and Admin, I want my address deduplicated, so that I do not receive duplicate copies from the same recipient list.
8. As a recipient, I want concise Draft identification, age and a link, so that I can act without receiving the full form by email.
9. As an Admin, I want reminders delivered to usable recipients even when another account lacks an email address, so that one missing address does not block everyone.
10. As an Admin, I want to inspect skipped recipient identities and reasons, so that I can correct account information.
11. As an Admin, I want a visible unresolved recipient problem when nobody has a usable address, so that notification failure is not mistaken for successful delivery.
12. As a creator, I want a Draft submitted before reminder dispatch to stop being eligible, so that I do not receive an obsolete pending-Draft reminder.
13. As a creator, I want a deleted Draft's unsent reminders canceled, so that deleted work does not continue generating mail.
14. As an operator, I want restart/retry and multiple workers to preserve the once-per-Draft rule, so that background processing does not create duplicate logical reminders.
15. As an Admin, I want Draft Management in Administration, so that I can find unfinished requests without using another person's account.
16. As an Admin, I want its list to resemble Requests and support search, filtering and pagination, so that I can locate a particular creator's Draft efficiently.
17. As an Admin, I want the list to show Draft identification, creator, Product Type, creation/update dates and reminder status, so that I can decide which Draft to inspect.
18. As an Admin, I want to open a Draft in read-only detail, so that I can inspect its contents before deciding to delete it.
19. As an Admin, I want viewing another creator's Draft to grant no Edit or Submit capability, so that management access does not transfer ownership.
20. As a non-Admin, I want other creators' Drafts to remain private, so that the new management exception does not expose them to ordinary users.
21. As a creator of any authenticated role, I want Delete in My Drafts, so that I can discard my own unwanted Drafts.
22. As a creator or Admin, I want a confirmation identifying the Draft before permanent deletion, so that I can verify the intended record.
23. As a creator or Admin, I want a failed deletion to retain the current screen with a clear error, so that I can retry without assuming the Draft disappeared.
24. As a creator or Admin, I want successful deletion to return me to the appropriate list and refresh its results, so that removed Drafts no longer appear in counts or detail.
25. As a user, I want the server to reject deletion once a request is submitted, so that a stale page cannot delete shared work.
26. As a user, I want concurrent Submit and Delete resolved atomically, so that exactly one lifecycle outcome wins.
27. As a user, I want a changed Draft revision detected before deletion, so that I can review changes made since opening it.
28. As a creator, I want permanent deletion to remove form values, schema captures and prior Draft audit metadata, so that content is not retained as ordinary request history.
29. As an Admin, I want a minimal deletion log containing the actor, Draft number and time, so that I can identify who deleted a Draft without retaining its form contents.
30. As a non-Admin, I want a deleted private Draft's history to remain undisclosed, so that removing its parent record does not make old metadata public.
31. As a creator, I want server-retained exports and queued email content carrying a deleted Draft invalidated or purged, so that those copies cannot still be downloaded or sent.
32. As a user, I want assignment controls removed from Create, Draft and request Detail, so that I no longer choose an individual owner.
33. As a user, I want Owner/Dept assignment columns removed from tables and Excel, so that those surfaces reflect the current work model.
34. As an Admin, I want old assignment values and assignment history removed, so that development-only assignment data does not persist as a legacy feature.
35. As a Setup File Owner, I want my account role and GNTC/MFG department retained, so that my existing authorization profile still works.
36. As a GNTC Setup File Owner, I want my Dashboard to start with New Product work, so that its default grouping matches my team's work.
37. As an MFG Setup File Owner, I want my Dashboard to start with Transfer Product and Existing Product work, so that its default grouping matches my team's work.
38. As a Setup File Owner, I want to choose another team group or all shared work, so that Dashboard filtering does not hide work I am allowed to handle.
39. As a Setup File Owner, I want to edit the other team's PSF work, so that team grouping does not become an access restriction.
40. As a user who can edit requester information, I want a saved Product Type change to update grouping immediately, so that table results and summary cards agree.
41. As a user, I want previously entered PSF data preserved when Product Type changes, so that regrouping does not erase work.
42. As a user, I want missing or unrecognized Product Type shown as “รอระบุ Product Type”, so that it is not silently classified as GNTC or MFG.
43. As a user, I want team filtering to combine consistently with existing search and date/status filters, so that rows, totals, summaries and pagination describe the same committed query.
44. As a Requester or Admin, I want my existing Dashboard scope and shared-request permissions preserved, so that assignment removal does not change unrelated access.
45. As a mobile or keyboard user, I want management, confirmation and filtering controls to remain reachable, so that I can perform the same actions without a desktop pointer.

## Implementation Decisions

### Draft access and deletion

- Extend the request lifecycle and Admin management interfaces. Admin management
  uses a paginated Draft-only list and read-only detail. My Drafts remains
  creator-scoped. Ordinary authenticated users do not gain foreign-Draft access.
- Introduce Admin Draft list/detail interfaces under `/api/admin/drafts` and a
  revision-checked `DELETE /api/requests/:requestId` operation. Authenticate from
  the server session and current account profile. The Delete operation accepts
  the expected opaque revision and permits only the Draft creator or Admin.
- Admin read access is separate from Draft mutation access. Reading a foreign
  Draft cannot authorize editing, schema upgrade, PSF saves or submission.
  Creators retain their existing own-Draft editing and submission permissions.
- The server checks current Draft state, authorization and revision within one
  transaction using the existing request-locking discipline. Submitted records
  remain undeletable even for Admin. A concurrent Submit/Delete yields one
  committed winner; the loser gets a clear conflict or unavailable-record result.
- Hard deletion removes the request, requester/PSF values and schema captures,
  any canonical/search projections, prior request audit metadata, reminder
  bookkeeping and retained mail content associated with that Draft.
- Preserve only a dedicated Admin-visible deletion event containing the deleting
  actor, Draft number and time. It carries no form values, schema, assignment
  snapshots or email body. Do not let an orphaned request-history join expose
  deleted private Draft contents through shared Audit History.
- Deletion also invalidates application-retained XLSX artifacts carrying the
  Draft. Coordinate running export jobs so they cannot publish a stale retained
  copy after deletion succeeds. Affected artifacts may be invalidated as a whole;
  unrelated request records must remain intact. Add sufficient membership or
  invalidation bookkeeping to support this without relying on opaque workbook
  contents. Existing artifacts without usable membership information require
  conservative invalidation of potentially affected cached exports.
- Delete confirmation names the Draft and states permanent removal. Disable
  duplicate actions while pending. On success close detail, return to the correct
  list and refresh it; on error preserve context and display the server outcome.

### Reminder eligibility and recipients

- A Draft becomes eligible at `created_at + 168 hours` while still unsubmitted.
  Saving does not reset age. Use a consistent authoritative time reference;
  display user-facing times in Asia/Bangkok.
- Existing overdue Drafts use the same rule. Run a bounded background eligibility
  scan so old records are handled without requiring a page visit. Reuse the
  current notifications/outbox/worker infrastructure rather than a browser timer.
- Store a durable once-per-Draft logical reminder identity and enforce uniqueness
  across restarts and concurrent workers. Job preparation and reminder identity
  creation must be atomic; a failed transaction must not consume eligibility.
- Resolve the creator's email and all current Admin account emails when preparing
  the logical reminder. Creator is To, Admins are CC. Normalize/deduplicate
  addresses with To taking precedence. Account role/department data comes from
  the server, never recipient lists submitted by a browser.
- If the creator has no usable address, deliver to usable Admin addresses in To.
  If an Admin lacks an address, deliver to other usable recipients. Persist
  skipped account identities/reasons for Admin inspection in Draft Management.
  If no recipients are usable, retain an unresolved eligible item, create no
  undeliverable mail job and allow a later scan after account correction.
- Once a valid-recipient logical reminder exists, later account changes do not
  create a second scheduled reminder. Its saved delivery snapshot and normal
  retry behavior remain explicit; skipped recipients stay inspectable.
- Content identifies the Draft number, creator, creation date, age and a link.
  It does not embed full requester/PSF form values or PSF Created Information.
  Creator/Admin links open the corresponding authorized detail experience.
- Respect existing mail enable/redirect/configuration controls and shutdown
  behavior. Pausing delivery does not erase age or the durable reminder identity.
  Retry the same logical job using the existing delivery policy.
- Recheck eligibility at the dispatch gate and coordinate it with Submit/Delete.
  When Submit/Delete wins before dispatch begins, no reminder is sent. Claimed
  but unsent jobs are canceled or purged appropriately; a worker cannot deliver
  content solely because it previously read an immutable outbox snapshot.
- One logical reminder does not imply exactly-once external delivery: an external
  acceptance followed by an acknowledgment failure may retry the same job under
  existing at-least-once semantics. Emails already accepted externally cannot
  be recalled after a later Submit/Delete.

### Assignment removal and Product Type grouping

- Remove request assignment selection, directory/mutation contracts, submitted
  assignee checks, assignment response fields, Owner/Dept table/detail/Excel
  metadata and Assigned-to-me/assignment-department filter semantics. Unsupported
  assignment inputs cannot continue silently creating assignment data.
- Remove stored request assignment UUID/name/department values and assignment
  audit events. Strip assignment-only metadata from mixed events while retaining
  their unrelated history. Clear or invalidate cached artifacts that would still
  expose removed assignment data. Scope cleanup to assignment data; preserve
  account role/department and ordinary request/form/status history.
- Setup File Owner remains one authorization role with GNTC/MFG account
  departments. Never capture the current PSF editor as a new implicit assignee.
- Derive Dashboard groups from the latest saved Product Type using the mapping
  above. Do not persist an individually assigned owner or use this mapping as a
  PSF access gate. Current cross-team PSF editing permissions remain unchanged.
- Setup File Owner Dashboard defaults to its account department's group, with
  selection of GNTC, MFG, all shared work and unclassified work. Drafts remain
  excluded from shared totals. Requester/Admin Dashboard scopes remain unchanged.
- Apply the same committed group predicate to rows, totals and summary cards,
  combined with existing filters. Reset pagination when filters change.
- Product Type changes affect grouping immediately without changing Status,
  release, ownership or existing PSF values. Missing/custom values outside the
  three recognized choices belong to the unclassified group. Do not hardcode
  unrelated schema labels or restrict all Form Management options to this mapping.

## Testing Decisions

- The user confirmed one primary system seam: visible browser actions and public
  HTTP behavior against the compiled application, disposable database and local
  external-mail receiver. Test observable outcomes rather than private helpers,
  SQL statement shapes or component state.
- Use the existing real-system browser fixture, local authentication substitute,
  mail capture and independent authenticated sessions as prior art. Database
  lifecycle tests already using temporary PostgreSQL/PGlite can support atomicity
  checks, but the acceptance result must remain visible through public interfaces.
- Provide a deterministic test-time facility inside the fixture so seven-day
  boundaries can be exercised without sleeping seven days. Production clients
  cannot submit arbitrary creation timestamps or bypass reminder timing.
- Test just before 168 hours, at the boundary and after it; Save does not reset
  age; old overdue records are included; repeat scans, restart and multiple workers
  create one logical reminder. External retry reuses that reminder.
- Test creator/all-Admin recipients, creator-also-Admin deduplication, missing
  creator/Admin addresses, no usable recipients, observable skipped-recipient
  reporting and mail-disabled/redirect behavior.
- Test authorized management reads and creator/Admin deletion; deny ordinary
  foreign-Draft access, Admin editing/submission of foreign Drafts and deletion
  of every submitted status. Test stale revisions, duplicate clicks and failures.
- Exercise concurrent Submit/Delete and Submit/Delete versus reminder dispatch
  using independently authenticated sessions and controlled fixture gates. Assert
  committed lifecycle outcomes and captured external messages, not timing guesses.
- After deletion, assert the Draft is unavailable through request/detail/history,
  Admin/My Draft lists, reminder status, retained mail and server export download
  interfaces. A concurrent export cannot republish it. Verify only the minimal
  Admin-visible deletion log remains and unrelated request content/history survives.
- Verify assignment is absent from Create/Draft/Detail, tables, public contracts,
  Excel and history, while account role/department and normal PSF authorization
  still work. No implicit assignment occurs on PSF save.
- Verify all three Product Type values, missing/custom values, latest-value
  regrouping, cross-team editing, shared counts/summary/filter consistency and
  unchanged Requester/Admin scope. Include desktop/mobile, light/dark and keyboard
  confirmation/focus/scroll behavior.
- Run relevant focused tests/typechecking while implementing and full regression
  suites at the end. Record dated commands, results and retained visual evidence.

## Out of Scope

- Recurring scheduled reminders, configurable per-user reminder intervals or a
  group-address replacement for current Admin recipients.
- Deleting submitted requests, restoring deleted Drafts or soft deletion.
- Admin editing/submitting other creators' Drafts.
- Individual Owner/Dept assignment, automatic owner capture or preservation of
  old assignment provenance as a supported feature.
- Removing account Setup File Owner role/department or restricting PSF editing
  to the Product Type-derived team.
- Changing ordinary status-transition notifications, Status catalog rules,
  schema snapshots or PSF release behavior except eligibility coordination needed
  by Draft lifecycle operations.
- Recalling email already accepted by the mail service or Excel copies already
  downloaded outside the application. Production deployment and corporate-service
  acceptance are separate work.

## Further Notes

- Draft creator means the stored requester/creator, not an assigned Setup File
  Owner. Draft reminder recipients are independent of destination-status policies.
- Admin Draft access is a deliberate new exception to current creator-only read
  privacy. It does not relax ordinary Draft write/Submit ownership.
- Existing shared-queue and manual-status decisions remain in force. Historical
  assignment amendments are superseded by this spec for the described surfaces;
  implemented behavior changes only when this spec is built and verified.
- Server-retained Excel content was identified during source inspection. Its
  invalidation is a consequence of permanent Draft/assignment-data removal, not
  a separate export redesign.
- The work spans request lifecycle, notification scheduling/delivery, Admin/My
  Draft interfaces, export retention and Dashboard projections. Split follow-up
  tickets around end-to-end capabilities and explicit blocking dependencies.
- No application code, live database content or deployment is changed by writing
  or publishing this specification.
