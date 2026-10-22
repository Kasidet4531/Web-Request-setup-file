# Search and filters — requirement notes

Status: interview decisions complete, 22 October 2026; implemented and verified
locally through `/implement`. See [verification](../verification/2026-10-22-search-filters.md).
This is a decision record, not a deployment claim. Workflow: `ask-matt` →
`grill-with-docs` (`grilling` and `domain-modeling`).

## Consolidated scope

- **Audit History:** replace the separate UUID and username inputs with one
  Search field for Request No., Product Description and the actor's name or
  username, with an explicit explanation of that scope. Search automatically
  after approximately 300 ms; Action/date selections update automatically.
  Keep Action visible, put dates inside More filters, keep selected dates
  visible when collapsed, retain Clear filters and remove Apply. There is
  **no Status filter** in History. Dates use Asia/Bangkok calendar days.
- **Requests and Dashboard:** retain their existing Keyword matching fields,
  explain those fields accurately and offer both catalog Status names and
  legacy Status values still stored on accessible requests. Selecting an
  explicit Dashboard Status switches the work-state filter to all work while
  preserving Team and keyword. Summary cards remain available to narrow the
  results afterward.
- **My Drafts:** explain its existing Request No./Requester Information search
  accurately. Its matching scope is unchanged.
- **Boundaries:** preserve request/history access, operational summary
  classification, saved Status values, Request Snapshot links and the
  Admin-only Draft Deletions tab. This work changes search/filter controls and
  queries; it does not rename or migrate legacy request Status values.

## Confirmed decisions — round 1

1. Improve Audit History search and filtering as the main change. Also make
   the search labels and explanations in Requests, Dashboard and My Drafts
   accurately describe their existing search scope; do not expand those three
   pages' search scope as part of this decision.
2. Audit History has one Search input matching any of Request No.,
   Product Description, the acting user's display name or their username.
   Partial text matches are supported. Explain the searchable fields next to
   the input instead of leaving users to infer them from “Keyword”.
3. Search runs automatically after typing pauses, consistent with the existing
   approximately 300 ms behavior elsewhere. Selecting a filter updates results
   automatically. Remove the Apply step; retain Clear filters.
4. Show Search, Action, More filters and Clear filters in the primary controls.
   Dates live in More filters. A selected date range remains visible when More
   filters is collapsed.
5. The user's initial mention of a Status filter was interpreted as a History
   control. **Superseded by the explicit round-2 clarification:** History does
   not need a Status filter.
6. Older Status values must remain selectable. The user described these as
   “status เก่าที่ไม่ได้ถูกแก้ใหม่”; round 2 clarifies the affected pages below.

## Confirmed decisions — round 2

7. **Do not add a Status filter to Audit History.** Its primary controls stay
   Search, Action, More filters and Clear filters. Historical-versus-current
   Status matching for audit entries is therefore outside this feature.
8. Requests and Dashboard Status filters must offer legacy Status names that
   still occur on requests, even when absent from the current catalog. Keep
   stored names intact. Include the current catalog and additional accessible
   stored request Status values; filter options must not be limited to the
   current catalog alone. This is a specific addition to round 1's label-only
   scope for these pages. It does not expand their Keyword search fields.
9. History date filters use Asia/Bangkok calendar days, consistent with the
   displayed History times. Both boundary dates are inclusive: from local
   midnight at the start date through the end of the selected end date.

## Confirmed decision — round 3

10. Selecting an explicit Status on Dashboard clears the active Open work,
    Overdue or Completed selection and queries all work states. Preserve the
    selected Team and keyword. A user can subsequently select a summary card
    to narrow the results again. This ensures that selecting a legacy Status
    outside the catalog is not silently defeated by the default Open work
    filter. It also applies when selecting a catalog Status. Do not invent
    an Open/Completed classification for unknown legacy Status names.

All interview questions Q1–Q7 are settled. The final scope above incorporates
the explicit Q4 correction that History does not need a Status filter.

## Interaction details for the implementation brief

- Within History Search, the confirmed fields are combined with OR; separate
  Action/date filters narrow those results with AND. Request No. is text with
  partial matching (e.g. `100` can match `PSF-000100`); this is not a request
  to add numeric-ID-only search rules or fuzzy name matching.
- Default History dates remain unrestricted. Allow either a start or end date
  alone. Explain invalid ranges next to the dates and avoid issuing an invalid
  search while the end date precedes the start date.
- When search or filters change, reset pagination to the first page. Keep
  filters editable while results load, prevent stale responses from replacing
  newer results, and ensure counts and rows describe the same query.
- Preserve the existing History table, Request Snapshot links and Admin-only
  Draft Deletions tab. The Search/filter changes target the System Audit Trail.

## Acceptance examples for implementation

- History: typing part of a Request No., Product Description, actor display
  name or username finds matching accessible entries without Apply. Action
  and dates can narrow the same search, and clearing filters restores the
  unfiltered first page.
- History: selecting 22 October 2026 includes timestamps from
  `2026-10-21T17:00:00Z` up to but excluding `2026-10-22T17:00:00Z`.
  The selected day range remains visible when More filters is collapsed.
- Requests/Dashboard: a legacy Status outside the current catalog appears as
  an option even if its matching request is not on the current result page.
  Selecting it returns matching accessible requests under the other filters.
- Dashboard: start on Open work, keep the chosen Team and keyword, then select
  a legacy Status. Open work is no longer selected and does not suppress the
  rows. Existing summary counts still use their catalog classifications.
- Across affected pages: updated search labels describe the actual fields;
  changing filters resets pagination; a slower earlier response cannot
  replace a newer result; rows/counts/options preserve actor visibility.

## Source facts at the interview, before implementation

- Requests and Dashboard currently match Request No., Product Description,
  Reference PSF Name, PSF Setup File Name and Probecard Name; Job File Name
  and Requester are not part of their Keyword search. My Drafts instead
  matches Request No. or the entire Requester Information JSON text. See
  `backend/src/requests/search-index.service.ts` (`queryRequests` and
  `queryOwnDrafts`).
- Audit History currently filters Request ID as an internal UUID and User
  as username only, despite displaying the actor's display name. It has no
  Status filter. See `backend/src/audit/audit_log.service.ts`
  (`buildGlobalWhere`) and `frontend/src/components/GlobalHistoryPage.tsx`.
- Each Request Snapshot records the request's Status immediately after its
  event. Entries before the snapshot feature have none, and bulk Status
  replacement deliberately omits snapshots. Status-change metadata can
  separately retain `fromStatus` and `toStatus`. See
  [ADR 0016](../adr/0016-full-request-snapshot-per-audit-history-entry.md).
- Imported Requests retain their original Status even when it is absent from
  the active catalog and have no prior audit history. See
  [the domain glossary](../../CONTEXT.md) (Imported Request).
- History displays times in Asia/Bangkok but currently interprets date
  filters as UTC days. See
  `frontend/src/components/ui/historyDateTime.ts` and
  `backend/src/audit/audit_log.service.ts` (`buildGlobalWhere`).

## Audit History columns — follow-up, 22 October 2026

The product owner additionally requested splitting the compound Request column
into atomic columns. Show Product Description and Request No. separately, in
that order after Time. Each submitted request number opens its Request Detail;
the existing descriptive labels and links remain available, including the API
labels `Untitled Draft (#ID)` and `Untitled Request (#ID)` for untitled requests.
Keep internal `DRAFT-…` numbers hidden, with `—` in the Request No. column. When
the API provides no request label, show `—` rather than repeating the request
number. Requestless configuration events retain their configuration label and
have no request number.

This amends the earlier instruction to preserve the existing History table;
search/filter behavior, Snapshot links and access rules remain as agreed.

## Existing constraints

All searches, result counts and filter options must preserve Draft privacy,
PSF Visibility Release and the existing actor access rules. Filter options
must not reveal values from otherwise hidden records. Filtering must not
change stored request Status values, historical events or catalog entries.
See [Audit History access](../audit-history-access.md) and
[the current implementation](../current-implementation.md).
