# Audit History access — confirmed product requirement

Confirmed by the product owner on 4 October 2026: **every authenticated role can view Audit History**. This requirement supersedes older design instructions that restricted global History to Admin.

| Role | Audit History navigation and page access |
| --- | --- |
| Requester | Yes |
| Setup Owner, GNTC or MFG | Yes |
| Admin | Yes |

Use the English label **Audit History** and the existing `/history` route. Show the link in desktop navigation and the mobile drawer for all three roles, in both Light and Dark modes. It belongs in shared work navigation, not inside Administration. Request-specific History remains available in the request detail flow.

This changes History viewing access. It does not grant administration, request editing, export, access to another person's private Draft, or access to unreleased PSF field values. Preserve those separate data-visibility rules when returning audit metadata and following request links. Anonymous visitors still need to sign in. Do not interpret all-role page access as permission to return otherwise hidden values.

## Implementation status

The authorized implementation on 5 October 2026 updates shared navigation and `GET /api/audit-logs` for every authenticated role. The API resolves the stored actor profile and applies visibility filters before returning audit rows: private Draft events remain creator-only, including for Admin, and Requesters cannot see unreleased PSF update events. Requestless configuration events remain available to authenticated roles. Viewing History does not grant the separate editing, export or administration permissions.

These are working-tree source changes, not deployment evidence. Local unit, HTTP, SQL and browser checks passed; see [implementation verification](superpowers/plans/2026-10-05-stitch-desktop-implementation.md). SQL visibility tests cover private Drafts and unreleased PSF metadata; browser checks cover both owner departments and anonymous access. The configured PostgreSQL and LDAP services have not been exercised or mutated by this implementation work. Earlier Admin-only source observations remain dated historical evidence.

Source pointers: [navigation](../frontend/src/components/navigationState.ts), [History route](../frontend/src/routes/history/index.tsx), [History page](../frontend/src/components/GlobalHistoryPage.tsx), [audit controller](../backend/src/audit/audit_log.controller.ts), [audit service](../backend/src/audit/audit_log.service.ts).

For future work, use this document as the current product requirement. Dated source audits describe observed behavior and remain implementation evidence, not a reason to restore the superseded Admin-only requirement. The History portion of decision D01 is resolved; other role decisions and detailed audit metadata decisions remain separate.

## Request Snapshot, 11 October 2026

A Request Snapshot opened from an entry ([ADR 0016](adr/0016-full-request-snapshot-per-audit-history-entry.md)) follows the rules above: it needs access to the request, a Requester gets no PSF Created Information in it and cannot open PSF update entries before release, and Draft-period Request Snapshots stay with the creator, including from Admin, until submission. The rule is enforced in [the request service](../backend/src/requests/requests.service.ts) (`getRequestSnapshot`).

This is a source change, not deployment evidence. `backend/test/request-snapshot.postgres.test.ts` covers these rules and passed on 11 October 2026, in memory and on the configured server inside temporary tables; see the [verification record](verification/2026-10-11-request-snapshot.md). The 5 October checks above do not cover it.

Attachment entries (20 October 2026, [Request Attachments](request-attachments.md)): `ATTACHMENT_UPLOADED` and `ATTACHMENT_DELETED` follow the same rules as the request they belong to, including Draft privacy, and store no Request Snapshot. Audit History names each request by its Product_Description (or `Untitled Draft (#ID)`) instead of a Draft number; this label adds no data a viewer could not already see on the request.

## Search and filters, 22 October 2026

The System Audit Trail uses one Search field for Request No., Product Description,
the acting user's display name or username. Partial matching is case insensitive;
the page explains the searched fields. Search runs after a 300 ms pause; Action
and date selections update automatically without Apply. More filters contains
From/To dates. A selected range stays visible when those inputs are collapsed.
Dates use Asia/Bangkok, including the entire end date, consistent with the table.
Invalid ranges display a field error and are not submitted. Changing filters
resets pagination; late responses cannot replace newer results.

There is no Status filter in History. The Admin-only Draft Deletions tab and
Request Snapshot links retain their existing behavior. `GET /api/audit-logs`
accepts `keyword`, `actionType`, `from`, `to`, `limit` and `offset`; its existing
`requestId` and `user` API filters remain supported. Counts and rows apply the
same search and visibility conditions. Search does not inspect hidden PSF content
or arbitrary audit metadata. See [verification](verification/2026-10-22-search-filters.md).
