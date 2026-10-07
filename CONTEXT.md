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
The first field in the default requester form, with the options **New Product**, **Transfer Product**, or **Existing Product**. Administrators may change the active form. Product Type is stored in the search index and displayed in the request table's title/product-type column. XLSX places metadata columns before requester-form fields; Product Type is not its first column.
Decided 8 October 2026, implemented in source but not yet run against the configured database: after the **Initial Data Load** the Product Type field is the **Request To** field, labelled "Request To", with the options **Create new PSF**, **Revise from old PSF** and **Product Transfer**, each followed by its required-document hint.
_Avoid_: Type of product, product category



**PSF Created Information**:
The section containing setup details, editable by backend-authorized Setup File Owners and Administrators. Form Management configures the independent `psf-created-information` family through the existing draft/publish lifecycle. New requests capture its active schema; publishing does not alter existing captures. Legacy requests without a PSF snapshot use the immutable original descriptor without rewriting values. Missing required fields may be saved only in Draft; non-Draft PSF saves validate captured requirements. Entry into the configured visibility trigger checks PSF requirements before submission, status updates or bulk replacement, including repeated entry after release.
_Avoid_: Setup Information, Completed Info

**Draft**:
A saved PSF Request not yet explicitly submitted. Every authenticated role has `My draft` and can edit/delete their own Drafts. Admin can inspect other creators' Drafts read-only and permanently delete them through Draft Management; ordinary foreign-Draft access remains private. Drafts are excluded from shared lists and operational totals. The detail Action center submits the same record to an explicitly selected work status; ordinary status updates cannot submit a Draft or return shared work to Draft.
_Avoid_: In-progress request, unsaved request

**Work Status**:
An Admin-configured catalog entry with immutable identity, verbatim name and explicit open/completed/cancelled classification. The configured database was verified to contain 17 entries on 4 October 2026; use the [complete exact strings](docs/status-catalog-and-manual-updates.md), not old short labels. Percentages are display text, not progression or automation. All authenticated actors may change shared work status through the single Action center. Catalog/request writes preserve opaque microsecond revisions, transactional projections and audit.

**PSF Visibility Release**:
A one-time stored release set on successful entry into any configured Work Status trigger, or by an administrator enabling a trigger for qualifying requests already at that status. Required PSF information must validate before release. Requester-only actors cannot see unreleased PSF data/history/Excel cells; authorized PSF team/Admin actors do not wait for release on accessible work. Backtracking, renaming or changing the trigger does not revoke release.

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
Planned external file linked to a PSF Request (e.g., specification sheets or probe cards layout files). Attachment runtime support is not implemented in the current source baseline; see ADR 0014.
_Avoid_: File upload, document

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
Decided 8 October 2026, implemented in source: with the Request To options, Create new PSF belongs to GNTC; Revise from old PSF and Product Transfer belong to MFG.

## Initial Data Load vocabulary

**Initial Data Load**:
A one-time, destructive reset that clears all PSF Requests and form configuration and replaces them from the PSF form detail workbook (its column mapping and its data). The Status catalog is replaced by the workbook's Status options, with Completed as the PSF Visibility Release trigger. User accounts are kept.
_Avoid_: Migration, import

**Imported Request**:
A PSF Request created by the Initial Data Load. Its requester is “NA”, so it belongs to no Requester account and is not in any Requester's own list. It has no assigned owner and no history. Its Status is kept verbatim from the workbook even when absent from the replaced Status catalog; such a request is listed and filterable by that Status but counted in no Open, Overdue or Completed total. An Imported Request already at Completed has its PSF Visibility Release set.

**Legacy Column**:
A workbook column with no audience (neither Requester nor Creater). It belongs only to the earlier Form Version 1 of the requester form and is absent from the active version. Imported Requests keep its values under Form Version 1.
_Avoid_: Old field, deprecated field

**Column Audience**:
The workbook's "For" value: Requester columns belong to the requester form; Creater columns belong to PSF Created Information; Creater/Requestor columns belong to the requester form.





