# Admin page evidence

Verified against current on-disk source with CodeGraph on **2026-10-05** (Asia/Bangkok). This is a design evidence record, not authorization to change production behavior. Inspection was read-only; no database records or external configuration were queried or changed. No credentials or real user identities are included.

## Route inventory

| Route | Actual surface | Important scope |
| --- | --- | --- |
| `/admin` | Administration directory | Groups Request configuration, Access, Reporting; tools are derived from the current role's navigation. |
| `/admin/users` | Users & Roles | Review identities and edit access; no user creation/deletion or identity/password editing. |
| `/admin/form-config?formKey=psf-request` | Requester Information version catalog | Default family when the query value is absent/unsupported. |
| `/admin/form-config?formKey=psf-created-information` | PSF Created Information version catalog | Independent versions and draft lifecycle. |
| `/admin/form-config/$version` | Requester Information version editor | Shorthand for the Requester family. |
| `/admin/form-config/$formKey/$version` | Explicit-family version editor | Same editor; Requester family is equivalent to the shorthand. Unsupported family renders an error. |
| `/admin/workflow` | Status Management catalog | Legacy route/component names do not represent a transition graph. |
| `/admin/autofill` | Auto-fill Rules | Configure Requester-field suggestions from completed requests. |
| `/admin/export-profile` | Export to Excel | Shared Requester/Admin export page; not a profile configuration editor. |
| `/admin/master-data` | Not configured | Explicit unavailable placeholder, absent navigation and hub tool list. Only View available tools to `/admin`. Do not invent CRUD. |

The `/admin/form-config` parent route renders an Outlet; the index is the catalog. These editor routes are equivalent renderings, not redirects. Sources: [AdministrationDirectory](../frontend/src/components/AdministrationDirectory.tsx), [navigationState](../frontend/src/components/navigationState.ts), [Admin routes](../frontend/src/routes/admin/), [AdminFormConfigPage](../frontend/src/components/AdminFormConfigPage.tsx).

## Roles and access

- Users, form configuration, status configuration, and auto-fill configuration APIs require an authenticated Administrator. Hiding navigation is presentation; the backend enforces access.
- Export permits Requester and Administrator, not Setup Owner. A Requester visiting the Administration directory can see their authorized Export tool; it is not a blanket Admin route gate.
- Current production Audit navigation is Admin-only. The approved redesign requirement makes Audit History visible to **all authenticated roles**. Preserve that requirement and record the production gap rather than reproducing the restriction in designs. PSF release/data visibility is a separate permission rule.

Sources: `backend/src/admin/user_management.controller.ts:59`, `backend/src/admin/form_schema.controller.ts:156`, `backend/src/admin/workflow_transition.controller.ts:46`, `backend/src/admin/autofill_rule.controller.ts:75`, `frontend/src/components/navigationState.ts:31`.

## Administration directory

Request configuration contains Form Management, Status Management, Auto-fill Rules. Access contains Users & Roles. Reporting contains Export to Excel. Tool descriptions explain each destination. Loading/error with Retry and a no-authorized-tools return to Dashboard are actual states. Do not describe Status Management as workflow sequence configuration.

Source: `frontend/src/components/AdministrationDirectory.tsx:9`.

## Users & Roles

Table columns: User (display name and username), Email, Role, Setup File Owner department, Action (Edit).

Edit access dialog shows the selected identity read-only. Editable controls:

- Role: Requester, Setup File Owner, Administrator.
- Setup File Owner department: GNTC or MFG, required only for Setup Owner. Switching to another role clears the department to null.
- Cancel and Save changes. Save is disabled when unchanged, invalid, or a save is pending. The current session is refreshed after a successful update, including self-role changes.

There are no create/delete/enable/disable/reset-password controls, and no editing of display name, username, or email. Sources: `frontend/src/components/AdminUserManagementPage.tsx:70`, `:313`; `frontend/src/components/adminUserManagementState.ts:7`; `backend/src/admin/user_management.controller.ts:81`.

## Form Management catalog

Two families: Requester Information (`psf-request`) and PSF Created Information (`psf-created-information`). Each family has independent versions, one active version, and at most one draft at a time.

Version entries show version number, title, description when present, Active/Draft/Inactive state, created and published dates. The server calls old published versions `published`; the UI labels them Inactive.

- Active/Inactive version: open read-only or Duplicate as draft. Duplication is disabled while a draft exists in that family.
- Draft version: open editable; Publish and Discard require confirmation.
- To reactivate an older version, duplicate it as a new draft and publish that new version. No direct Activate-old-version action.

Source: `frontend/src/components/AdminFormConfigPage.tsx:45`.

## Form version editor

Header/context: family, version, title, Active/Draft/Inactive, created metadata, family selector, Back to Form management, Preview form. Active/Inactive versions are read-only with Duplicate as draft.

Draft editor has Unsaved changes / All changes saved, Save draft, Publish, and these controls:

- Form title.
- Each section: Section title, stable section key read-only, Move up/down, Remove section. At least one section remains; removing populated sections asks for confirmation.
- Each field row: label, stable field and canonical keys, type, Required/Optional, Edit, Move up/down.
- Add field per section and Add section.
- Add/Edit field dialog: Field label, Field type (Short text, Long text, Date, Dropdown, Multiple choice), Required field checkbox. Dropdown/Multiple choice add editable Choices with Add choice and Remove; at least one choice remains. Field key and Canonical key are read-only identities. Apply changes only the page draft; Cancel discards dialog changes. Remove field confirms and is disabled for the last field.
- Advanced · Edit schema JSON is collapsible; parse/validation errors are visible. Preview is read-only, identifies unsaved versus saved draft, and has Close preview.
- Unsaved editor navigation/browser exit is guarded. Save draft and Publish are separate actions; Publish is disabled until changes are saved and the parsed schema is valid.

Optional schema flags exist in the TypeScript model, but current visual field dialog does **not** expose Searchable, Exportable, Auto-fill trigger, identity-key editing, or section role-visibility controls. Do not invent those switches.

Sources: `frontend/src/components/AdminFormConfigEditor.tsx:63`, `:122`; `frontend/src/components/AdminFormConfigPage.tsx:396`; `frontend/src/types/forms.ts:10`.

### Save/publish validation and effects

The frontend requires the selected form family, nonblank title/section titles/field labels and keys, supported controls, boolean required flag, nonblank choices, unique section/field keys, at least one section and field. Restricted legacy section visibility requires review rather than silent conversion.

The backend revalidates the stored draft on Publish. It verifies server-owned family/version/title, unique safe section/field keys and canonical keys, supported control types, boolean required flags, and **nonempty, trimmed, unique** radio/dropdown options. Requester schemas must keep `product_type` and `requester_name` required. Publishing must target a draft in the selected family; old active becomes Inactive and the draft becomes Active atomically. Publishing Requester forms also makes incompatible auto-fill rules inactive with a reason.

Publish confirmation explains impact: new requests use the newly active version. Existing Requester Drafts retain their version and need explicit upgrade before submission; submitted requests retain saved snapshots. Publishing a PSF family version does not upgrade existing request PSF schemas/data.

Sources: `frontend/src/components/adminFormConfigState.ts:52`, `:194`; `frontend/src/components/AdminFormConfigPage.tsx:396`; `backend/src/admin/form_schema.service.ts:358`, `:430`, `:756`.

## Status Management

Catalog columns: exact Status name, Status type, request count, actions. Draft is protected, cannot be renamed/deleted, and has no business request count. Business types: Open work, Completed, Cancel. Exact full database strings remain authoritative; display may truncate to one line with full-name access.

Supported actions: Add status (New status name and Status type); Rename (Save name / Cancel); Delete confirmation with Replacement status. There is no edit-kind control, next-step/action graph, status order editor, or automatic progression.

Names must be nonblank; Draft is reserved; trim/case ambiguous duplicates are rejected. Rename updates current requests and their search-index status names. Deleting a used status requires another surviving non-Draft replacement; unused status replacement is optional. Delete with request replacement is an explicit admin bulk action and is audited.

Requester PSF visibility trigger selects a surviving non-Draft status or Not configured. Current production selector persists settings on change. First entry releases Requester PSF access permanently. Deleting the current trigger requires an explicit replacement trigger or None. Replacement into the release trigger validates required PSF data before release. Admin catalog management is distinct from the approved Request Detail manual selection + separate Save Status.

Sources: `frontend/src/components/AdminWorkflowTransitionPage.tsx:73`; `backend/src/admin/workflow_transition.service.ts:244`, `:254`, `:737`.

## Auto-fill Rules

List columns: Trigger field, Fill target fields, Source, Status, Action (Edit). Labels and canonical keys are shown; removed fields and inactive reasons remain explained. Source is fixed: Previous completed PSF request.

Create/Edit editor uses the active Requester schema. Trigger field is text/textarea/date/select/radio; targets must be one or more unique canonical fields excluding the trigger. Controls are trigger dropdown, target checkboxes, Cancel, Create autofill rule / Save autofill rule. Removed targets must be deselected before saving; changing trigger removes it from targets. Saving a valid rule activates it again. Suggestions preserve manually entered values. There are no delete or manual activation/deactivation controls.

Sources: `frontend/src/components/AdminAutofillRulesPage.tsx:72`, `:143`, `:269`; `frontend/src/components/adminAutofillRulesState.ts:71`; `backend/src/admin/autofill_rule.controller.ts:35`.
