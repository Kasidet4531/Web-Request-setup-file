# PSF Setup File Request Management

Unified portal for managing requests to create or update PSF Setup Files, from private drafts through shared team workflows, dynamic form schemas, and audit history.

## Core Domain

**PSF Setup File**:
A physical configuration file maintained on external engineering or probe station tools outside this system.
_Avoid_: Setup File

**PSF Request**:
A request to create or update a PSF Setup File.
_Avoid_: Ticket, order, file request, setup request

**Draft**:
A private, unsubmitted PSF Request owned exclusively by its creator until explicitly submitted into a shared work status.
_Avoid_: Temporary request, unfinished form, in-progress request, pending request

**Requester**:
The creator of a PSF Request (`Created By` on Imported Requests) who provides the initial product and test specification details.
_Avoid_: Requester Role, applicant

**Modified By**:
The most recent actor to save changes to a PSF Request, initialized from the workbook's `Modified By` column for Imported Requests and updated automatically on every subsequent request modification, whether or not the request's form has a Modified By field.
_Avoid_: Last editor, updater

**Setup File Owner**:
An engineer in the GNTC or MFG department responsible for completing PSF Created Information and progressing shared PSF Requests.
_Avoid_: Engineer, owner, setup owner

**Request To**:
The request classification that says whether a PSF Request creates a new PSF (Create new PSF), revises an existing one (Revise from old PSF) or transfers a product (Product Transfer).
_Avoid_: Product Type, type of product, product category

**Target 12NC Desc**:
The standard product description that names a PSF Request and its Attachment folder.
_Avoid_: Product Description, Product_Description, Title

**Dashboard Team Group**:
The operational team grouping (GNTC or MFG) derived from a request's Request To for filtering shared work queues.

**PSF Created Information**:
The setup details section completed by Setup File Owners or Administrators after the request is created.
_Avoid_: Setup Information, Completed Info

**Work Status**:
A named lifecycle stage in the administrator-managed status catalog, classified as draft, open, completed, or cancelled, and listed in the order administrators set.
_Avoid_: Percentage stage

**Submission Status**:
The Work Status every submitted Draft enters, chosen by an administrator.
_Avoid_: Initial status, first status

**Requester-Selectable Status**:
A Work Status a Requester may choose, and only while the request is in one of the Work Statuses an administrator listed for it.
_Avoid_: Requester step, Requester transition

**Status Email Policy**:
The administrator's choice, per Work Status, of who is emailed when a PSF Request enters it: fixed addresses in To and CC, and optionally the request's own Requester in To or CC.
_Avoid_: Notification subscription, mailing list

**PSF Visibility Release**:
A permanent release milestone granted when a PSF Request enters a configured trigger Work Status, making PSF Created Information visible to Requesters on screen. Excel exports do not wait for it.

## Schedule and Reminders

**Due Date**:
The date by which the PSF team should reach PSF Visibility Release, set by the system when the request is submitted.
_Avoid_: Deadline, target date

**Team Capacity**:
How many PSF Requests a Dashboard Team Group takes on per day when Due Dates are set.
_Avoid_: Quota, daily limit

**Team Queue**:
The PSF Requests of one Dashboard Team Group that were submitted in this web and have not reached PSF Visibility Release.
_Avoid_: Backlog, pending list

**Due Date Postponement**:
A later Due Date set by any role, with a required reason.
_Avoid_: Extension, reschedule

**Overdue**:
The state of an open PSF Request past its Due Date, which lasts until the request is completed or cancelled.
_Avoid_: Late, delayed

**Status Reminder**:
A repeating email sent every set number of days while a PSF Request stays in a Work Status that has reminders switched on.
_Avoid_: Stuck alert, overdue reminder

## Forms and Automation

**Form Schema**:
The versioned definition of sections, fields, and validation rules for either Requester Information or PSF Created Information.
_Avoid_: Form layout, form template

**Form Version**:
A sequential revision number within a Form Schema family captured as a schema snapshot by each PSF Request.
_Avoid_: Version number, revision

**Canonical Key**:
A stable identifier that maps equivalent fields across different Form Versions for search indexing, autofill, and export.
_Avoid_: Global key, standardized key

**Search Index**:
The structured projection of canonical request values used to filter, sort, and summarize shared PSF Requests.
_Avoid_: Query table, view

**Field Help Text**:
Guidance shown under a form field, set per field by administrators.
_Avoid_: Hint, tooltip, description

**Autofill Rule**:
An administrator-configured rule that populates target fields in a new PSF Request from the latest completed PSF Request matching a trigger field value, used only when Request To is Revise from old PSF.
_Avoid_: Auto-complete mapping, field copy rule, smart suggestion

**Reference PSF**:
The earlier PSF Request that a Revise from old PSF request is based on, named by its old PSF name.
_Avoid_: Old PSF, refer PSF

**Revise Change Type**:
What a Revise from old PSF request changes (Change Map layout, Change FPC layout or Any change), which decides the Attachments copied from the Reference PSF.
_Avoid_: Product layout

## Attachments

**Attachment Category**:
The group an Attachment belongs to by its file name: Map Layout File, FPC Layout File or Other.
_Avoid_: Attachment slot, file type

**Map Layout File**:
A wafer map layout file (.xml, .dpl, .lay, .tpl or .mdf), including E142 files.

**FPC Layout File**:
An Excel workbook whose name starts with PCSF.
_Avoid_: PCSF file

**Master Data**:
Standardized reference options embedded within a Form Schema to populate choice fields.
_Avoid_: Lookup tables, static lists

## Export

**Direct Export**:
An Excel export returned as the download while the person waits, used up to `EXPORT_SYNC_THRESHOLD` requests while a Direct Export slot is free. Settings and older code call it a synchronous export.
_Avoid_: direct download when the queue is meant

**Export Job**:
An Excel export queued and built in the background one at a time, used above the threshold or when every Direct Export slot is busy. A failed Export Job is never retried.
_Avoid_: async export, background download

**Export Memory Limit**:
The most JavaScript heap one export's workbook worker may use (`EXPORT_WORKER_MAX_MEMORY_MB`); an export that needs more fails on its own.
_Avoid_: RAM cap

**Export Preview**:
An Excel export shown 100 rows a page, in the file's order, on the Export to Excel page, with the file's own columns, values and request count for the same filters.
_Avoid_: request preview list, dashboard preview

## Administration and Auditing

**Local Authorization Profile**:
The application user record that assigns an authenticated person's role and Setup File Owner department.
_Avoid_: Local authentication, local password login

**Development Identity**:
A reserved non-production account used to simulate a specific role and department during local development and testing.

**Draft Management**:
The administrative capability to inspect unsubmitted Drafts read-only, check reminder statuses, and permanently delete orphaned Drafts.
_Avoid_: Draft inspection portal, draft admin console

**Draft Reminder**:
A one-time notification sent when a PSF Request remains in Draft seven days after creation.

**Audit History**:
The chronological record of lifecycle and field changes across PSF Requests, along with permanent Draft deletion logs.
_Avoid_: Activity feed, transaction logs, change tracker

**Request Snapshot**:
The complete read-only state of a PSF Request (Requester Information, PSF Created Information, and Work Status) as it stood immediately after an Audit History entry.
_Avoid_: Snapshot, version, revision

## Initial Data Load

**Initial Data Load**:
A destructive reset that replaces all PSF Requests, Form Schemas, and the Work Status catalog from the PSF form detail workbook (`Column_Mapping` and `Data` sheets) while preserving user accounts.
_Avoid_: Migration, import

**Imported Request**:
A historical PSF Request loaded from the `Data` worksheet during the Initial Data Load, preserving verbatim cell values, `Created By` as Requester, and `Modified By`, with no linked user account or prior Audit History.

**Column Audience**:
The `For` classification in `Column_Mapping` that assigns a workbook column to Requester Information (`Requester`, `Creater/Requestor`, and core schedule/actor fields `Due Date`, `Created By`, `Modified By`), PSF Created Information (`Creater`), or Legacy Columns (remaining blank `For` columns).

**Legacy Column**:
A retired workbook column in `Column_Mapping` with no assigned audience (`For` is blank, excluding core fields `Due Date`, `Created By`, and `Modified By`) that is preserved on Imported Requests under Form Version 1 and omitted from the active Form Version.
_Avoid_: Old field, deprecated field, grey field
