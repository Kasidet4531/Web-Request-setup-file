# Status catalog and manual status updates

Confirmed by the product owner on 4 October 2026: use the complete status strings from the configured PostgreSQL database, and do not introduce workflow transitions that change Status automatically when an action is clicked.

## Source of truth

Read `workflow_transition_config`, key `status-catalog-v1`, field `config_json.entries[].name`. Runtime clients read this catalog through `GET /api/workflow/statuses`; a request's `status` is its stored full string. The table below is a read-only database snapshot from 4 October 2026, not a replacement for runtime catalog fetching. Admin catalog edits may change it later. [Inspection evidence](../.stitch/status-catalog-evidence.json) contains the exact names and kinds, with no credentials or person/request identifiers.

| Exact database status string | Catalog kind |
| --- | --- |
| `Draft` | `draft` |
| `5% -- Reject (Information not complete)` | `open` |
| `10% -- Test Engineer Data Entry` | `open` |
| `20% -- PSF File Creating` | `open` |
| `30% -- Compare Old and New layout` | `open` |
| `40% -- Feedback Requester(Layout mismatch)` | `open` |
| `80% -- Wait for create DCC` | `open` |
| `81% -- Edit Template Map (Bin62)` | `open` |
| `82% -- Wait for sent Template Map` | `open` |
| `83% -- Complete Excel probe pattern` | `open` |
| `85 % -- Reject check list` | `open` |
| `90% -- Wait for buyoff check list` | `open` |
| `93% -- Provide test template map to EWFM\Update auto FI script (ST Fab)` | `open` |
| `95% -- Reject (Wrong site location and wafer map)` | `open` |
| `99% -- Wait requestor Buyoff site location and wafer map` | `open` |
| `100% -- Completed` | `completed` |
| `0% -- Rejected (Cancel Request)` | `cancelled` |

Preserve the complete string, including percent prefix, punctuation, capitalization, spacing (`85 %`) and the literal backslash in the `93%` name. Do not substitute the old short labels `Submitted`, `Setup In Progress`, `PSF Created`, `Need More Information`, `Rejected`, `Cancelled`, or a bare `Completed` for a stored status. `PSF Created Information` remains the name of a form section; it is not a current catalog status. Dashboard summaries may use **Open work**, **Overdue** and **Completed** as group labels, not individual Status values.

The snapshot has 17 entries and a maximum name length of 71 characters. Every stored request Status in the inspected database belongs to this catalog. Percent prefixes are part of the name, not calculated progress, ordering, completion rules or automatic triggers; the order of Status lists is the catalog order administrators set (see [Status order](#status-order-24-october-2026)). Classify summaries and badge styling using `kind`: `draft`, `open`, `completed`, `cancelled`. In particular, `83% -- Complete Excel probe pattern` and `99% -- Wait requestor Buyoff site location and wafer map` are `open`.

## Confirmed interaction constraints

There is no directed transition matrix, mandatory stage order, Next stage, Approve, Reject or Mark Complete shortcut, percentage stepper, or action that chooses a Status on the user's behalf. Opening a request, clicking a Dashboard summary/filter, saving Requester Information, saving PSF Created Information, applying autofill, exporting or viewing History must not change the request Status. Selecting a filter changes only the view. Display rule amended by the product owner on 4 October 2026: queue labels may use at most one line and an overflow ellipsis (…). Keep full stored strings unchanged and available through Desktop hover/keyboard focus and click in an accessible full-value popover. Viewing/dismissing the popover does not change Status. Do not replace names with friendly aliases. Filters still contain full catalog option values. Current redesign scope is Desktop only, Light/Dark; Mobile design is excluded by the latest product instruction.

## Manual Status control — confirmed 4 October 2026

The product owner confirmed manual selection from the exact catalog plus a separate **Save Status** button in Request Detail. Selecting an option changes only the pending selection; only an explicit Save Status commits it. Saving Requester Information or PSF Created Information never saves or changes Status. Disable Status saving while form data is dirty; allow saving or discarding those edits first. Preserve current access permissions and revision checks. There are no automatic next-stage actions or directed transition paths.

Draft submission remains a separate existing lifecycle; this submitted-request Detail design does not replace it. Status display remains a single line with ellipsis and full-value disclosure. The latest product-owner direction on 4 October 2026 restores the Stitch Detail v1 tabbed design and adds a Requests › current request number breadcrumb. Keep the separate Save Status label and manual-save behavior. The intervening original-layout/color-only Detail v2 exploration is superseded; do not use its Apply status presentation as the active redesign reference.

## Separate existing domain rules

Preserve creator-private Draft access and the dedicated initial-submission lifecycle. The selected initial work Status must come from the catalog; do not hardcode `Submitted`. Shared work cannot return to Draft. Preserve the server's request access, validation, revision checks and transactional audit. This clarification does not create new role restrictions or grant PSF editing to Requesters.

Requester visibility of PSF values is controlled by persistent release state and the configured PSF access triggers, not the old short Status `PSF Created`. Each non-Draft status can be a trigger, selected in its Edit modal and shown in the catalog table. Release follows valid entry into any trigger, or an administrator saving its checked trigger to release existing requests at that status. All candidates must have valid required PSF information; otherwise that combined save rolls back. Access already released is retained. Deleting a trigger does not automatically make its replacement a trigger. Release does not choose or advance a Status. Status Management manages catalog entries and release settings, not allowed paths between stages.

## Legacy Status values in list filters, 22 October 2026

Requests and Dashboard filters offer the current catalog plus distinct non-Draft
Status names still stored on submitted requests, including Imported Requests.
The public catalog response returns these as `filterStatuses`; its `statuses`
and `entries` remain the active catalog. Legacy names are preserved verbatim,
and listing them does not make them allowed Status changes or classify them
as Open/Overdue/Completed. Private Drafts never contribute extra filter options.

Selecting an explicit Dashboard Status clears its active summary-card selection
to query all work states, keeping Team and Search. Users can select a summary
card afterward to narrow the result again. Clearing all Dashboard filters retains
the existing reset to Open work. History has no Status filter. See
[verification](verification/2026-10-22-search-filters.md).

## Status order, 24 October 2026

The catalog keeps an explicit order (issue #115): `config_json.entries` holds Draft
first, then the Work Statuses in the order administrators set, and `statuses` in
the catalog responses lists the Work Status names in that order. Code that needs
"the first open status" or any other ordered choice reads `entries` in array order.

Status Management shows a Position column. An administrator types a Work
Status's new position, a whole number from 1 (the first Work Status after Draft)
to the number of Work Statuses, and chooses Move or presses Enter; the others
shift. Any other value is refused under the input and nothing is sent. Draft
shows "Always first" and has no control. The page sends the `move` operation of
`PUT /api/admin/workflow`:

```json
{ "action": "move", "id": "<status id>", "position": 1, "expectedUpdatedAt": "<catalog revision>" }
```

The server refuses moving Draft ("Draft keeps its place first.") and a position
that is not a whole number in range ("Position must be a whole number from 1 to
N."). The usual `expectedUpdatedAt` check applies: when another administrator
changed the catalog first, the save fails with "The workflow status catalog
changed. Reload and try again." and the page loads the current order. A move
changes only the order: no request's Status, no name, kind, Status Email Policy
or PSF Visibility Release trigger, and no email. It is recorded as a Workflow
catalog update.

Every list of Work Statuses follows the order: Status Management, the Requests,
Dashboard and Export Status filters (legacy names from `filterStatuses` follow
the catalog), and the Action center's Status dropdown, where the request's
current status sits in its catalog place (a current status outside the catalog
stays first). The order is display order only. It does not restrict which
status may be chosen and is not a progression. It survives restarts; an
[Initial Data Load](initial-data-load.md) sets it to the workbook's Status options.
Sources: [catalog service](../backend/src/admin/workflow_transition.service.ts),
[Status Management](../frontend/src/components/AdminWorkflowTransitionPage.tsx),
[Action center](../frontend/src/components/RequestsWorkspace.tsx). Administrators'
steps are in the Thai guide page
[เรียงลำดับ Work Status และย้ายตำแหน่งช่องในฟอร์ม](admin-guide-th/status-and-field-order.md).

## Documentation and design boundary

The 4 October clarification originally changed documentation and design instructions only. The authorized implementation on 5 October now changes application source: Request Detail uses runtime catalog values and the existing revision-checked status API, with a separate explicit Save Status control and independent form Edit/Save/Cancel controls in the approved tabs. Choosing a Status alone does not save it; dirty form data blocks Status saving. Shared Desktop Light/Dark preferences and navigation are integrated with that flow.

Local unit, HTTP, SQL and browser checks passed; see [implementation verification](superpowers/plans/2026-10-05-stitch-desktop-implementation.md). These local checks do not establish deployment or live-service behavior. This implementation work has not exercised or mutated the configured PostgreSQL or LDAP services. Historical plans, screenshots and test results retain their original dated evidence. Their old short statuses, transition matrices and preset action buttons are superseded by this document. File/class/endpoint names containing `workflow_transition` or `allowedNextStatuses` are existing technical identifiers; they do not authorize a transition editor or automatic status progression in the UX.
