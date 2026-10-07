# Draft lifecycle and assignment removal — requirement notes

Status: interview complete; retained decision record. See the
[consolidated specification](2026-10-07-draft-lifecycle-and-product-team-filtering.md)
for implementation and testing requirements.
Baseline: `main` at `43f6d6a`. No application changes are authorized by this file.

## Incoming requirements

- Send email reminders about Drafts that remain unsubmitted for seven days,
  to both the Draft creator and Admin.
- Add Admin Draft Management with the ability to delete unwanted Drafts.
- Remove the Owner/Dept assignment system.

## Current behavior to reconcile

- Drafts are creator-private, including against other Admin/Setup File Owner
  actors. Assignment does not grant Draft access.
- Request assignment identifies a selected person by UUID with saved name and
  department snapshots; account role/department are separate authorization data.
- Existing email notifications are driven by entry into configured work
  statuses. Draft reminders introduce a time-based trigger.

See [current implementation](../current-implementation.md),
[domain glossary](../../CONTEXT.md), and
[email notifications](../email-notifications.md).

## Confirmed decisions — round 1

1. Count seven days from Draft creation; later saves do not reset its age.
2. Send one reminder per Draft once it reaches seven days while still Draft.
3. Send to the Draft creator and every account currently holding Admin role;
   a configured group address does not replace the Admin account recipients.
4. Admin Draft Management uses a layout similar to Requests, with a list,
   read-only detail and Delete. My Drafts also allows creators to delete their
   own Drafts. Submitted requests cannot be deleted through these capabilities.
5. Delete Draft data permanently; soft deletion/recovery is not requested.
6. Remove request Owner/Dept assignment; retain account Setup File Owner role
   and account department for authorization.

## Confirmed decisions — round 2

7. Setup File Owner account departments remain GNTC and MFG. New Product work
   belongs to GNTC; Transfer Product and Existing Product work belong to MFG.
   This is a Dashboard grouping/filtering rule, not an edit-permission rule.
8. Remove request assignment controls and Owner/Dept display from Create,
   Draft/Detail, request tables and Excel. The user also requested removal of
   existing assignment history; retaining legacy assignment provenance is not
   required for this development project. Application data to purge must be
   precisely scoped, preserving unrelated request content/history.
9. Permanent Draft deletion removes form data, prior Draft history and related
   stored email content. Retain only a minimal Admin-visible deletion log with
   actor, Draft number and time; no form content.
10. Deliver reminders to recipients with usable email addresses and expose
    skipped recipients for Admin inspection. Creator is To and Admin accounts
    are CC, with duplicate addresses delivered once.
11. Existing Drafts already seven days old are eligible when the feature is
    enabled; the same once-per-Draft rule applies.

## Confirmed decisions — round 3

12. Department/Product Type grouping applies only to Dashboard filtering.
    GNTC and MFG Setup File Owners can still view and edit each other's shared
    PSF work under the existing access rules. Admin permissions remain unchanged.
    Dashboard starts with the actor's department grouping, with filtering allowing
    access to other groups; this does not recreate request assignment.
13. Grouping follows the latest saved Product Type immediately, including after
    Submit. Previously entered PSF information is preserved when the group changes.
14. Missing/unrecognized Product Type is shown as "รอระบุ Product Type" and
    is not assigned to either group until an authorized actor corrects it.

## Next phase

The user confirmed synthesis by invoking `/to-spec` and approved the system-level
testing scope on 7 October 2026. The consolidated specification is ready for
local implementation. The user declined GitHub issue publication and invoked `/implement` directly. This note does
not change implemented runtime behavior.

## Source facts affecting the design

- Current audit records survive request deletion and global History permits
  records whose request no longer exists. Draft deletion must explicitly handle
  prior form-edit metadata and retained-event visibility.
- Existing outbox request references use ON DELETE SET NULL and dispatch reads
  stored content. Submit/Delete must cancel pending reminders and remove Draft
  payloads retained in mail jobs, rather than relying on request deletion alone.
- Stored account email may be absent, including initially provisioned Admins.
- Assignment currently affects Create/Draft/Detail, Dashboard relationships,
  shared tables, Excel and History. Account authorization is separate.

Concurrent Submit/Delete must recheck Draft state atomically. A reminder should
not be dispatched after Submit/Delete has won the eligibility check. Email
already accepted by the external mail service cannot be recalled.
