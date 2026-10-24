# PSF Setup File Request Management

> **Status clarification, 4 October 2026:** [Database Status names and interaction rules](docs/status-catalog-and-manual-updates.md) supersede old short-label catalogs, directed transition matrices and action-driven automatic Status changes below. Use complete configured strings for every displayed request Status. The 4 October clarification was documentation-only; the approved 5 October implementation now updates source. See the current implementation and verification record.

This context manages the request lifecycle for creating and updating PSF Setup Files, enforcing role-based visibility and dynamic form configurations.

Scope: current `main`, including the 7 October Draft lifecycle and Product Type grouping changes. The original glossary audit was 2026-10-02. Use this glossary with
[current implementation](docs/current-implementation.md); historical specifications
and ADR bodies do not override the current source.

Product clarification, 4 October 2026: **Audit History is viewable by every authenticated role** (Requester, Setup Owner and Admin), with a shared `/history` navigation link. See [the implemented access rule and verification](docs/audit-history-access.md). This supersedes older Admin-only History design instructions; private Draft and PSF field visibility rules remain separate.

## Language

**PSF Setup File**:
A physical configuration file created and maintained outside this system (e.g. on a probe station or engineering tool). This web application does not generate or export PSF Setup Files; it only tracks requests to create or update them.
_Avoid_: Setup File (ambiguous without "PSF" prefix)

**PSF Request**:
A request to create or update a PSF Setup File.
_Avoid_: File Request, Setup Request

**Requester**:
A user role providing request information. Every authenticated role may create a PSF Request; the stored requester is its creator, not a later editor. All authenticated actors may edit shared requester information, while Draft editing remains creator-only.
_Avoid_: Requester Role, Applicant

**Setup File Owner**:
An engineer or user role responsible for shared PSF work and setup details, belonging to **GNTC** or **MFG**. This role and Admin may edit accessible shared PSF information, including Completed work, across both departments. Ordinary foreign Drafts remain inaccessible; Admin Draft Management grants read-only inspection without transferring Draft editing rights. No individual owner is assigned or automatically captured by a PSF save.
_Avoid_: Engineer, Owner, Setup Owner

**Related Work**:
Shared PSF Requests available to a Setup File Owner, optionally filtered by Product Type-derived Dashboard Team Group. Requester and Admin Dashboard views remain creator-scoped. Drafts are excluded from shared work and operational totals.

**Product Type**:
The first field in the default requester form, with the options **New Product**, **Transfer Product**, or **Existing Product**. Administrators may change the active form. Product Type is stored in the search index and displayed in its own Product Type column of the request tables (21 October 2026; before, under the title). XLSX places metadata columns before requester-form fields; Product Type is not its first column.
Decided 8 October 2026, implemented in source and loaded into the configured database on 8 October 2026 (with `--lenient`): after the **Initial Data Load** the Product Type field is the **Request To** field, labelled "Request To", with the options **Create new PSF**, **Revise from old PSF** and **Product Transfer**, each followed by its required-document hint.
_Avoid_: Type of product, product category



**PSF Created Information**:
The section containing setup details, editable by backend-authorized Setup File Owners and Administrators. Form Management configures the independent `psf-created-information` family through the existing draft/publish lifecycle. New requests capture its active schema; publishing does not alter existing captures. Legacy requests without a PSF snapshot use the immutable original descriptor without rewriting values. Missing required fields may be saved only in Draft; non-Draft PSF saves validate captured requirements. Entry into the configured visibility trigger checks PSF requirements before submission, status updates or bulk replacement, including repeated entry after release.
_Avoid_: Setup Information, Completed Info

**PSF Setup File Name** / **Job File Name**:
The PSF Created Information fields with canonical keys `psf_setup_file_name` and `job_file_name`. The Requests and Dashboard tables show each in its own column, whether or not the field is searchable (21 October 2026). Like all PSF Created Information they are hidden on screen from a Requester-only actor until PSF Visibility Release (Excel exports excepted, ADR 0019), and keyword search matches the PSF Setup File Name only where the actor can see it.
_Avoid_: PSF name (ambiguous with the `reference_psf_name` field)

**Draft**:
A saved PSF Request not yet explicitly submitted. Every authenticated role has `My draft` and can edit/delete their own Drafts. Admin can inspect other creators' Drafts read-only and permanently delete them through Draft Management; ordinary foreign-Draft access remains private. Drafts are excluded from shared lists and operational totals. The detail Action center submits the same record to an explicitly selected work status; ordinary status updates cannot submit a Draft or return shared work to Draft.
_Avoid_: In-progress request, unsaved request

**Work Status**:
An Admin-configured catalog entry with immutable identity, verbatim name and explicit open/completed/cancelled classification. The configured database was verified to contain 17 entries on 4 October 2026; use the [complete exact strings](docs/status-catalog-and-manual-updates.md), not old short labels. Percentages are display text, not progression or automation. All authenticated actors may change shared work status through the single Action center. Catalog/request writes preserve opaque microsecond revisions, transactional projections and audit.

**Status Email Policy**:
The Admin's per-Work Status choice of who is emailed when a PSF Request enters that status: fixed addresses in To and CC, and optionally the request's own Requester in To or CC (21 October 2026). The Requester is reached through the account that created the request, so the Requester of an Imported Request is never emailed. It applies whoever changes the Status, including submission and bulk replacement.
_Avoid_: Notification subscription, mailing list

**PSF Visibility Release**:
A one-time stored release set on successful entry into any configured Work Status trigger, or by an administrator enabling a trigger for qualifying requests already at that status. Required PSF information must validate before release. Requester-only actors cannot see unreleased PSF data or history on screen; authorized PSF team/Admin actors do not wait for release on accessible work. Excel exports and the Export Preview show PSF Created Information to every role, released or not (ADR 0019, 21 October 2026). Backtracking, renaming or changing the trigger does not revoke release.

**Auto-fill Rule**:
An administrator-managed configuration defining a trigger field and its target fields to populate from a previous completed PSF Request. Active rules participate in autofill; Inactive rules do not. Administrators explicitly choose activation, while publishing an incompatible form may disable a rule for review. Editing an Inactive rule or restoring its fields does not reactivate it.
_Avoid_: Smart suggestion, autofill setting

**Canonical Key**:
A standardized identifier used to map and normalize fields across different form versions.
_Avoid_: Global key, standardized key

**Search Index**:
A structured database table storing pre-extracted canonical values for quick query, filter, and export performance.
_Avoid_: Query table, view

**Local Authorization Profile**:
The application-local user record that supplies role and setup-owner department after LDAP or explicitly enabled development authentication. It does not validate passwords. There are three authorization roles and four reserved development identities; GNTC and MFG are departments, not extra authorization roles.
_Avoid_: Local Authentication, local password login

**Development Identity**:
A temporary reserved account selected through mock login while the backend is in development/test with `DEV_AUTH_ENABLED=true`. It uses the same stored authorization profile and session as LDAP login. Production denies the endpoint. See [local development authentication](docs/local-development-auth.md) for exact guards and removal steps.

**Form Schema**:
The JSON-structured definition of a PSF Request form, specifying fields, input types, sections, and layout configurations. Required validation uses each captured requester/PSF form separately. Section access is not configured in the schema; PSF visibility follows backend actor policy and persistent release, not a percentage or hardcoded status label.
_Avoid_: Form layout, form template

**Form Version**:
A sequential integer within one Form Schema family: `psf-request` or `psf-created-information`. Requester draft schema upgrades remain explicit. A request's PSF schema snapshot is captured at creation and is not upgraded by publishing either family or by upgrading its requester schema. Historical rendering and export resolve each request's stored descriptor, with fixed-schema compatibility for legacy PSF records.
_Avoid_: Version number, revision

**Attachment**:
An external file linked to a PSF Request (e.g. PCSF, E142, `.dpl`, `.lay`, specification sheets or images), kept under its original name in the request's NAS folder `[Product_Description]_[ID]`, named as the SharePoint export named the Imported Requests' folders, and shared by every role that can see the request. Files placed in that folder directly on the NAS are Attachments too, except system files such as those Windows or the SharePoint export leave there. Implemented 20 October 2026; folder naming settled 21 October 2026 ([ADR 0018](docs/adr/0018-nas-folder-names-follow-the-sharepoint-export.md)). See [Request Attachments](docs/request-attachments.md).
_Avoid_: File upload, document

**Attachment Policy**:
What the server refuses on upload: the per-file size limit (`ATTACHMENT_MAX_BYTES`) and the blocked file extensions. It is served to every signed-in role, independent of any request, so each Attachment picker can state it before files are chosen; the backend holds the only copy. Added 21 October 2026; see [Request Attachments](docs/request-attachments.md#access-and-api).
_Avoid_: Upload rules, file restrictions

**Request ID**:
The sequential integer identifying a PSF Request, continuing the Imported Requests' `ID` (`PSF-000100` is ID 100). It names the request's NAS folder, and a submitted request's number is `PSF-` and the ID padded to six digits. A Draft keeps its `DRAFT-YYYYMMDD-NNNN` number until submitted. IDs are never reused.
_Avoid_: Draft number (a different, temporary identifier), UUID

**Product_Description**:
The requester form's `title` field, labelled Product_Description in the Initial Data Load forms. It names a request in Audit History and prefixes its NAS folder; New Request starts it as `Product_Description`. The request tables show it in their first column, headed Product Description (21 October 2026).
_Avoid_: Title alone when the folder or Audit History label is meant

**Master Data**:
The standardized reference values (e.g., list of Products, Wafer FABs, or Machines) embedded directly within the Form Schema to populate selection dropdowns, ensuring data consistency.
_Avoid_: Lookup tables, static lists

## Draft lifecycle vocabulary

These terms follow the [Draft lifecycle specification](docs/specs/2026-10-07-draft-lifecycle-and-product-team-filtering.md) and current implementation.

**Draft Reminder**:
A one-time reminder about a PSF Request still in Draft seven days after creation, addressed to its creator and current Admin accounts. Editing the Draft does not reset its age. Unusable recipient addresses are reported for Admin inspection.

**Draft Management**:
The Admin capability to list and read Drafts and permanently delete them before submission. Management read access does not transfer a Draft's editing or submission rights. Creators can permanently delete their own Drafts through My Drafts.

**Dashboard Team Group**:
A Product Type-derived grouping: New Product belongs to GNTC; Transfer Product and Existing Product belong to MFG. It is used for Dashboard filtering while preserving cross-team PSF editing rights. Missing or unrecognized Product Type is displayed as “รอระบุ Product Type” and belongs to neither team group.
Decided 8 October 2026 and updated 19 October 2026: with the Request To options, `Create new PSF*` belongs to GNTC; `Revise from old PSF*`, `Revise Old PSF*` and `Product Transfer*` belong to MFG.

## Initial Data Load vocabulary

**Initial Data Load**:
A one-time, destructive reset that clears all PSF Requests and form configuration and replaces them from the PSF form detail workbook (`PSF_form_detail-censor.xlsx`, its column mapping and its data). The Status catalog is replaced by the workbook's Status options, with Completed as the PSF Visibility Release trigger. User accounts are kept.
_Avoid_: Migration, import

**Imported Request**:
A PSF Request created by the Initial Data Load. Its Requester (`requester` / `requester_name`) is populated from `Created By` in `Data` with `requester_user_id = NULL` (so it is not tied to any individual Requester account), and its `Modified By` is populated from `Modified By` in `Data`. All cell values from `Data` (including `"NA"` and legacy choice strings) are preserved verbatim, and unchanged legacy choice values remain valid when editing other fields. It has no prior audit history. Its Status is kept verbatim from the workbook even when absent from the replaced Status catalog; such a request is listed and filterable by that Status but counted in no Open, Overdue or Completed total. An Imported Request already at Completed has its PSF Visibility Release set.

**Modified By**:
The most recent actor to save changes to a PSF Request, displayed alongside Requester in request metadata and as a locked read-only field in the form. It initializes from `Modified By` on Imported Requests (or the creator on new requests) and updates automatically to the acting user's display name whenever the request is modified, whether or not its form has a Modified By field; a bulk Status replacement does not set it. Since 21 October 2026; before, only forms with a Modified By field recorded it.
_Avoid_: Last editor, updater

**Legacy Column**:
A workbook column with no audience (neither Requester nor Creater), excluding core context fields (`Due Date`, `Created By`, and `Modified By`). It belongs only to the earlier Form Version 1 of the requester form and is absent from the active version. Imported Requests keep its values under Form Version 1.
_Avoid_: Old field, deprecated field

**Column Audience**:
The workbook's "For" value: Requester columns (`Requester`, `Creater/Requestor`, and core fields `Due Date`, `Created By`, `Modified By`) belong to the requester form; Creater columns belong to PSF Created Information.

## Export vocabulary

**Direct Export**:
An Excel export built while the person waits and returned as the download. It is used when the export holds at most `EXPORT_SYNC_THRESHOLD` requests (default 10,000) and fewer than `EXPORT_SYNC_MAX_CONCURRENT` Direct Exports (default 2) are running; otherwise the export becomes an Export Job. Limits apply per backend process. Settings and older code call it a synchronous export. Added 21 October 2026.
_Avoid_: direct download when the queue is meant

**Export Job**:
An Excel export queued in `psf_export_jobs` and built in the background, one at a time. Only the account that created it can see its status and download it; the Export page follows it until the file is ready. A failed Export Job is final and never retried.
_Avoid_: async export, background download

**Export Memory Limit**:
The most JavaScript heap one export's workbook worker may use, `EXPORT_WORKER_MAX_MEMORY_MB` (default 1024). The finished file's bytes are outside it. An export that needs more fails on its own with a message saying so. Added 21 October 2026.
_Avoid_: RAM cap

**Export Preview**:
An Excel export shown on the Export to Excel page 100 rows a page, in the file's order, with the file's own columns, values (including `NA`) and request count for the same filters. The header row and Request No stay pinned while the table scrolls both ways; Previous and Next move between pages as on the request list. Added 21 October 2026; paged the same day.
_Avoid_: request preview list, dashboard preview

## Audit History vocabulary

**Request Snapshot**:
The complete content of one PSF Request (Requester Information, PSF Created Information and Work Status) as it stood immediately after one Audit History entry. It is read-only and is seen under the same visibility rules as the entry it belongs to.
Decided 11 October 2026, implemented in source.
_Avoid_: snapshot on its own (a request's captured Form Schema is its "schema snapshot"), version, revision






## Decided 24 October 2026, not yet built

Fook's fix plan for the 22 October review settled these terms and decisions. They are not in source yet; until they are, the entries above describe current behaviour. Definitions are in [GLOSSARY.md](GLOSSARY.md).

- **Request To** replaces Product Type as the name people see; **Target 12NC Desc** replaces Product Description (the `title` field).
- **Submission Status** and **Requester-Selectable Status**: Requesters change Status only where an administrator allows it ([ADR 0020](docs/adr/0020-requesters-change-status-only-where-allowed.md)).
- **Due Date**, **Team Capacity**, **Team Queue**, **Due Date Postponement** and **Overdue**: the system sets Due Date at submission ([ADR 0021](docs/adr/0021-system-sets-due-date-from-team-capacity.md)).
- **Status Reminder**: a repeating email while a request stays in a Work Status, off by default.
- **Attachment Category**, **Map Layout File**, **FPC Layout File**, **Reference PSF** and **Revise Change Type**: categories from file names, and Autofill only for Revise from old PSF with a one-time file copy ([ADR 0022](docs/adr/0022-attachment-categories-and-revise-file-copy.md)).
- **Field Help Text**: guidance under a form field.
- Go-live loads the final MIS export into an empty database once ([ADR 0023](docs/adr/0023-go-live-from-an-empty-database.md)).
