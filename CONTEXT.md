# PSF Setup File Request Management

This context manages the request lifecycle for creating and updating PSF Setup Files, enforcing role-based visibility and dynamic form configurations.

## Language

**PSF Setup File**:
A physical configuration file created and maintained outside this system (e.g. on a probe station or engineering tool). This web application does not generate or export PSF Setup Files; it only tracks requests to create or update them.
_Avoid_: Setup File (ambiguous without "PSF" prefix)

**PSF Request**:
A request to create or update a PSF Setup File.
_Avoid_: File Request, Setup Request

**Requester**:
A user role that creates a PSF Request and provides the initial request information.
_Avoid_: Requester Role, Applicant

**Setup File Owner**:
An engineer or user role responsible for reviewing any PSF Request, creating or updating the actual setup file, and entering the setup details. Each Setup File Owner is classified into one of two sub-roles/departments: **GNTC** or **MFG** (where a user can belong to only one department). When a PSF Request is submitted, the Requester selects a specific Setup File Owner via a searchable dropdown. The selected Setup File Owner and their department (GNTC or MFG) are stored with the request, and displayed on the dashboard and export Excel reports.
_Avoid_: Engineer, Owner, Setup Owner

**Product Type**:
A required field positioned at the very top of the PSF Request form, where the Requester selects exactly one option: **New Product**, **Transfer Product**, or **Existing Product** (via radio buttons). This field is stored in the search index and displayed at the beginning of the tables in both the dashboard and export Excel.
_Avoid_: Type of product, product category



**PSF Created Information**:
The section of the PSF Request filled in by the Setup File Owner containing the final setup details.
_Avoid_: Setup Information, Completed Info

**Draft**:
A PSF Request that has been created but not yet submitted.
_Avoid_: In-progress request, unsaved request

**Auto-fill Rule**:
A configuration defining a trigger field and its target fields to automatically populate data from historical records.
_Avoid_: Smart suggestion, autofill setting

**Canonical Key**:
A standardized identifier used to map and normalize fields across different form versions.
_Avoid_: Global key, standardized key

**Search Index**:
A structured database table storing pre-extracted canonical values for quick query, filter, and export performance.
_Avoid_: Query table, view

**Local Authentication**:
The mechanism of validating user identities using credentials (username and hashed password) stored directly within the application's database.
_Avoid_: SSO (in current phase), External Authentication

**Form Schema**:
The JSON-structured definition of a PSF Request form, specifying fields, input types, sections, layout configurations, and field-level visibility constraints.
_Avoid_: Form layout, form template

**Form Version**:
A sequential integer indicating the revision of a Form Schema. Requests are locked to a specific Form Version snapshot upon submission to ensure historical rendering accuracy.
_Avoid_: Version number, revision

**Attachment**:
An external file uploaded and linked to a PSF Request (e.g., specification sheets or probe cards layout files).
_Avoid_: File upload, document

**Master Data**:
The standardized reference values (e.g., list of Products, Wafer FABs, or Machines) embedded directly within the Form Schema to populate selection dropdowns, ensuring data consistency.
_Avoid_: Lookup tables, static lists







