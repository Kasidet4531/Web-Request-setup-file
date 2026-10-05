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
