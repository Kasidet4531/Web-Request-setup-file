# PSF Setup File Request Management

This context manages the request lifecycle for creating and updating PSF Setup Files, enforcing role-based visibility and dynamic form configurations.

Scope: `unified-local-auth`, source-audited on 2026-10-02. Use this glossary with
[current implementation](docs/current-implementation.md); historical specifications
and ADR bodies do not override the current source.

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
An engineer or user role responsible for shared PSF work and setup details, belonging to **GNTC** or **MFG**. This role and Admin may edit PSF information in every work status, including Completed, and their own Drafts; foreign Drafts remain inaccessible. An initial PSF save may associate unassigned work, but ordinary status changes and later editors do not replace an existing association. Related work is actor-created work OR department-associated work, deduplicated by request ID. Stored associations appear on the dashboard and Excel reports.
_Avoid_: Engineer, Owner, Setup Owner

**Product Type**:
The first field in the default requester form, with the options **New Product**, **Transfer Product**, or **Existing Product**. Administrators may change the active form. Product Type is stored in the search index and displayed in the request table's title/product-type column. XLSX places metadata columns before requester-form fields; Product Type is not its first column.
_Avoid_: Type of product, product category



**PSF Created Information**:
The section containing setup details, editable by backend-authorized Setup File Owners and Administrators. Form Management configures the independent `psf-created-information` family through the existing draft/publish lifecycle. New requests capture its active schema; publishing does not alter existing captures. Legacy requests without a PSF snapshot use the immutable original descriptor without rewriting values. Missing required fields may be saved only in Draft; non-Draft PSF saves validate captured requirements. Entry into the configured visibility trigger checks PSF requirements before submission, status updates or bulk replacement, including repeated entry after release.
_Avoid_: Setup Information, Completed Info

**Draft**:
A saved, creator-private PSF Request not yet explicitly submitted. Every authenticated role has `My draft`; even Admin/PSF actors cannot access a foreign Draft. Drafts are excluded from shared lists and operational totals. The detail Action center submits the same record to an explicitly selected work status; ordinary status updates cannot submit a Draft or return shared work to Draft.
_Avoid_: In-progress request, unsaved request

**Work Status**:
An Admin-configured catalog entry with immutable identity, verbatim name and explicit open/completed/cancelled classification. The initial catalog contains all 17 approved labels; percentages are display text, not progression. All authenticated actors may change shared work status through the single Action center. Catalog/request writes preserve opaque microsecond revisions, transactional projections and audit.

**PSF Visibility Release**:
A one-time stored release set on successful entry into the explicitly configured trigger, initially unconfigured. Requester-only actors cannot see unreleased PSF data/history/Excel cells; authorized PSF team/Admin actors do not wait for release on accessible work. Backtracking, renaming or changing the trigger does not revoke release.

**Auto-fill Rule**:
A configuration defining a trigger field and its target fields to automatically populate data from historical records.
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






