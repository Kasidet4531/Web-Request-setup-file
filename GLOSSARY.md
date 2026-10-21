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

**Product Type**:
The request classification (`Request To`) that identifies whether a PSF Request creates a new PSF, revises an existing PSF, or transfers a product.
_Avoid_: Type of product, product category

**Dashboard Team Group**:
The operational team grouping (GNTC or MFG) derived from a request's Product Type for filtering shared work queues.

**PSF Created Information**:
The setup details section completed by Setup File Owners or Administrators after the request is created.
_Avoid_: Setup Information, Completed Info

**Work Status**:
A named lifecycle stage in the administrator-managed status catalog, classified as draft, open, completed, or cancelled.
_Avoid_: Percentage stage

**PSF Visibility Release**:
A permanent release milestone granted when a PSF Request enters a configured trigger Work Status, making PSF Created Information visible to Requesters.

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

**Autofill Rule**:
An administrator-configured rule that populates target fields in a new PSF Request from the latest completed PSF Request matching a trigger field value.
_Avoid_: Auto-complete mapping, field copy rule, smart suggestion

**Master Data**:
Standardized reference options embedded within a Form Schema to populate choice fields.
_Avoid_: Lookup tables, static lists

## Administration and Auditing

**Local Authorization Profile**:
The application user record that assigns an authenticated person's role and Setup File Owner department.
_Avoid_: Local authentication, local password login

**Development Identity**:
A reserved non-production account used to simulate a specific role and department during local development and testing.

**Draft Management**:
The administrative capability to inspect unsubmitted Drafts read-only, check reminder statuses, and permanently delete orphaned Drafts.
_Avoid_: Draft inspection portal, draft admin console

**Status Email Policy**:
The administrator's choice, per Work Status, of who is emailed when a PSF Request enters it: fixed addresses in To and CC, and optionally the request's own Requester in To or CC. Imported Requests have no Requester address.
_Avoid_: Notification subscription, mailing list

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
_Avoid_: Old field, deprecated field
