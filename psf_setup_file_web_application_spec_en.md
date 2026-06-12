# PSF Setup File Web Application Specification

> This document consolidates the discussed requirements and architecture for a Web Application to manage PSF Setup File Requests, Dynamic Forms, Workflow Status, Search, Auto-fill, Excel Export, and Audit History.

---

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Login Page](#2-login-page)
- [3. Dashboard Page](#3-dashboard-page)
- [4. PSF Request Form Page](#4-psf-request-form-page)
- [5. Requester Information Section](#5-requester-information-section)
- [6. PSF Created Information Section](#6-psf-created-information-section)
- [7. Workflow Status](#7-workflow-status)
- [8. Role-Based Permission Matrix](#8-role-based-permission-matrix)
- [9. Dynamic Form Design](#9-dynamic-form-design)
- [10. Form Versioning](#10-form-versioning)
- [11. Canonical Field Mapping](#11-canonical-field-mapping)
- [12. Search Performance Design](#12-search-performance-design)
- [13. Auto-fill Design](#13-auto-fill-design)
- [14. Excel Export](#14-excel-export)
- [15. History / Audit Log](#15-history--audit-log)
- [16. Admin Page](#16-admin-page)
- [17. Backend API Service](#17-backend-api-service)
- [18. Backend Module Structure](#18-backend-module-structure)
- [19. API Design](#19-api-design)
- [20. Database Design](#20-database-design)
- [21. State Persistence](#21-state-persistence)
- [22. Frontend Pages and Route Structure](#22-frontend-pages-and-route-structure)
- [23. UI/UX Recommendations](#23-uiux-recommendations)
- [24. Functional Requirements Summary](#24-functional-requirements-summary)
- [25. Non-Functional Requirements](#25-non-functional-requirements)
- [26. Final Recommended Architecture](#26-final-recommended-architecture)

---

## 1. Project Overview

This system is a web application for managing requests to create or update **PSF Setup Files**. The application supports a workflow where the requester submits the required setup information, and the setup file owner later completes the PSF setup information.

The main user roles are:

- **Requester**: Creates a PSF request and fills in the request information.
- **Setup File Owner / Engineer**: Reviews the requester information, creates or updates the setup file, and fills in the PSF Created information.
- **Admin**: Manages users, roles, master data, form configuration, workflow settings, visibility rules, auto-fill rules, and export settings.

The key workflow requirement is:

> The requester must not see the **PSF Created Information** section until the setup file owner has completed the setup information and updated the request status to **PSF Created**.

---

## 2. Login Page

### Purpose

The Login page authenticates users before they can access the application. The authenticated user identity is used to determine role-based access, page visibility, section visibility, and available actions.

### Recommended Design

```text
Login session -> HttpOnly Secure Cookie
User profile / role -> verified by Backend through /api/me
Frontend state -> stores only non-sensitive UI data
```

### Key Requirements

- The system shall require users to log in before accessing the application.
- After page refresh, users with a valid session shall remain logged in.
- The backend shall be the source of truth for user identity, session validity, and role authorization.
- The frontend may use role information to show or hide buttons, but all important actions must be revalidated by the backend.
- Passwords and sensitive authentication tokens shall not be stored in `localStorage`.

### Example Login Flow

```text
User logs in
  ↓
Backend verifies credentials (Local Authentication)
  ↓
Backend sets HttpOnly Secure Cookie
  ↓
Frontend calls GET /api/me
  ↓
Backend returns user profile and role
  ↓
Frontend renders allowed pages and actions
```

---

## 3. Dashboard Page

### Purpose

The Dashboard provides an overview of PSF requests according to the user's permission level.

### Dashboard Components

The Dashboard should include:

- Summary cards
- Request list table
- Search and filters
- Status tracking
- Due date tracking
- Quick actions

### Suggested Summary Cards

```text
Total Requests
Waiting for Setup
Setup In Progress
PSF Created
Completed
Overdue
```

### Suggested Dashboard Table Columns

| Column | Description |
|---|---|
| Request No. | Unique request number |
| Product Type | Product classification (New Product, Transfer Product, Existing Product) |
| Title | Request title |
| Reference PSF Name | Referenced PSF name |
| Probecard Name | Probecard name |
| PSF Setup File Name | Created setup file name |
| Status | Current workflow status |
| Priority | Request priority |
| Due Date | Required completion date |
| Requester | Person who created the request |
| Setup Owner | Person who took action on the request (automatically recorded) |
| Setup Owner Role | Sub-role/Department of the Setup Owner (GNTC or MFG) |

### Main Search Fields

The Dashboard should support search by:

```text
- PSF Setup File Name
- Title
- Probecard Name
- Reference PSF Name
- Status
- Request Date
- Due Date
- Product Type
- Setup Owner Role
```

Frequently searched fields should be extracted into indexed columns or a dedicated search index table. The application should not rely on searching directly inside raw JSON for these fields as the main search strategy.

---

## 4. PSF Request Form Page

### Purpose

The PSF Request Form page is used to create new PSF requests and update PSF setup information according to workflow status and user role.

The form should be divided into two main sections:

```text
1. Requester Information
2. PSF Created Information
```

---

## 5. Requester Information Section

### Purpose

This section is filled in by the requester when creating a PSF request.

### Example Fields

```text
- Product Type (Radio button: New Product, Transfer Product, Existing Product) [At the very top, Required]
- Title
- Request For
- Request To
- Reference PSF Name
- Request Date
- Priority
- Due Date
- 12 NC
- Product
- Wafer FAB
- Probecard Name
- Description
- Attachment
```

### Behavior

- The requester shall be able to create and submit the request.
- After submission, the Requester Information section should become read-only for the requester.
- The setup file owner shall be able to view this section in read-only mode.
- The admin may override or edit this section if the system permits admin override.

---

## 6. PSF Created Information Section

### Purpose

This section is filled in by the setup file owner or engineer after completing the setup file work.

### Example Fields

```text
- First Die Ref. (X,Y)
- Probe & Coordinate Quadrant
- Wafer ID Format
- Mirror Die Available
- Prepare FPC & Physical Wafer to PSF Cabinet E2
- PSF Setup File Name
- Job File Name
- Template
- Layout
- Attachment
```

### Visibility Rules

| User Role | Before PSF Created | After PSF Created |
|---|---|---|
| Requester | Hidden or placeholder only | Visible as read-only |
| Setup File Owner | Visible and editable | Visible and editable if not completed |
| Admin | Visible and editable | Visible and editable |

### Recommended Placeholder for Requester

Before the PSF Created section becomes visible, the requester should see a clear placeholder message instead of empty fields:

```text
PSF setup information is not available yet.
This section will be visible after the setup file owner completes the PSF setup.
```

---

## 7. Workflow Status

### Recommended Status Flow

```text
Draft
  ↓
Submitted
  ↓
Setup In Progress
  ↓
PSF Created
  ↓
Completed
```

### Optional Statuses

```text
Need More Information
Rejected
Cancelled
```

### Status Description

| Status | Meaning | Requester Sees PSF Created? |
|---|---|---|
| Draft | Request has not been submitted | No |
| Submitted | Request has been submitted | No |
| Setup In Progress | Setup owner is working on the setup file | No, or placeholder only |
| PSF Created | Setup file information has been completed and updated | Yes, read-only |
| Completed | Request is fully completed | Yes, read-only |
| Need More Information | Additional information is required from requester | No, or partial only |
| Rejected | Request has been rejected | No |
| Cancelled | Request has been cancelled | No |

### Email Notification System

The system automatically dispatches email notifications on key status transitions:

1. **Submission Notification**:
   - **Trigger**: When a Request status changes from `Draft` or `Need More Information` to `Submitted` (upon Requester submission).
   - **Recipient**: All users with the `Setup File Owner` role (both GNTC and MFG).
   - **Email Subject**: `[PSF Request] New Request Assigned: [Request No.] - [Title]`
   - **Email Content**: A structured table containing:
     - Requester Name
     - Due Date
     - Priority
     - Product Type
     - A prominent Call-to-Action (CTA) button/link to the Request detail page.

2. **Status Update / Completion Notification**:
   - **Trigger**: When any user manually updates the request status using the status actions dropdown (including marking as `PSF Created`, `Completed`, `Rejected`, or reverting to an earlier stage).
   - **Recipient**: The original `Requester` and all users with the `Setup File Owner` role (both GNTC and MFG).
   - **Email Subject**: `[PSF Request] Status Updated to [New Status]: [Request No.] - [Title]`
   - **Email Content**: A structured table showing the new status, who performed the update, key metadata (Requester, Due Date, Priority, Product Type), and a prominent CTA button/link to view the Request detail page.

### Manual and Dynamic Status Transitions

To support manual human evaluation and flexible workflows:
- A **Status Dropdown Control** is visible on the Request Detail page to all roles (**Requester**, **Setup Owner**, and **Admin**) in **all request statuses**.
- Users can manually select any target status from the dropdown to transition the request based on their assessment (e.g., if a request is in the `PSF Created` status but is found to be incorrect, both the Requester and Setup Owner can change the status to `Rejected` or revert it to `Setup In Progress` to signal a correction is needed).
- The list of available statuses and transitions remains configurable by administrators via the Admin Page, but the UI allows manual selection of the next status directly.
- The system automatically records the Setup File Owner and their department (GNTC or MFG) when a Setup File Owner changes the status or updates the PSF Created section.

---

## 8. Role-Based Permission Matrix

| Page / Action | Requester | Setup Owner | Admin |
|---|---:|---:|---:|
| Login | Yes | Yes | Yes |
| Dashboard | Own requests | All requests (pre-filtered to pending) | All requests |
| Create Request | Yes | Optional | Yes |
| Edit Requester Information | Before submit | No | Yes |
| View Requester Information | Yes | Yes | Yes |
| Edit PSF Created Information | No | Yes | Yes |
| View PSF Created Information | After PSF Created | Yes | Yes |
| Update Status Manually (Dropdown) | Yes (All statuses) | Yes (All statuses) | Yes (All statuses) |
| View History | Related requests | All requests | All requests |
| Export Excel | Optional | Yes | Yes |
| Admin Page | No | Optional | Yes |

> [!NOTE]
> The **Setup Owner** role has two sub-roles/departments: **GNTC** and **MFG** (each user is assigned to exactly one of them). Both departments share the same access rights and permissions in the matrix above, but their assigned department determines how they are logged and displayed on the dashboard and export reports.

---

## 9. Dynamic Form Design

### Concept

The system may use a **Dynamic Form** or **Schema-driven Form** approach so that admins can adjust fields without directly modifying frontend code.

### Recommended Design

```text
Admin defines form schema
  ↓
Backend stores form definition
  ↓
Frontend fetches active schema
  ↓
Frontend renders form automatically
```

### Example Schema Concept

```json
{
  "formKey": "psf-request-form",
  "version": 1,
  "title": "PSF Request Form",
  "sections": [
    {
      "sectionKey": "requester_information",
      "title": "Requester Information",
      "visibleTo": ["requester", "setup_owner", "admin"],
      "fields": [
        {
          "fieldKey": "title",
          "canonicalKey": "title",
          "label": "Title",
          "type": "text",
          "required": true,
          "searchable": true,
          "exportable": true
        },
        {
          "fieldKey": "probecard_name",
          "canonicalKey": "probecard_name",
          "label": "Probecard Name",
          "type": "text",
          "required": true,
          "searchable": true,
          "exportable": true
        }
      ]
    },
    {
      "sectionKey": "psf_created_information",
      "title": "PSF Created Information",
      "editableBy": ["setup_owner", "admin"],
      "visibleWhenStatusIn": ["PSF_CREATED", "COMPLETED"],
      "fields": [
        {
          "fieldKey": "psf_setup_file_name",
          "canonicalKey": "psf_setup_file_name",
          "label": "PSF Setup File Name",
          "type": "text",
          "required": true,
          "searchable": true,
          "exportable": true,
          "autofillTrigger": true
        }
      ]
    }
  ]
}
```

---

## 10. Form Versioning

### Requirement

Users should not manually select a form version. Versioning should be handled by the system.

### Design Principle

```text
User sees the current active form
Backend stores formVersion with each submission
Historical records are rendered using schema snapshot
Search, export, and auto-fill use canonical data
```

### Draft Version Upgrades (Hybrid Strategy)
- When a user opens a Draft request associated with an older form version, the UI prompts them with a confirmation dialog:
  1. **Upgrade**: Migrates the draft to the latest active schema (matching fields preserved, new fields added, obsolete fields removed).
  2. **Remain on Old Version**: Renders the draft form using its original schema snapshot.
- Once a request is submitted (status moves from Draft to Submitted), it is locked permanently to its form version schema snapshot.

### Required Submission Fields

```text
form_key
form_version
schema_snapshot_json
response_json
submitted_by
submitted_at
status
```

### Why Schema Snapshot Is Needed

- To display old records correctly even if the active form changes later.
- To support auditability and historical accuracy.
- To prevent broken historical display if fields are removed or labels are changed in future versions.

---

## 11. Canonical Field Mapping

### Purpose

Canonical field mapping prevents version-related issues when field names change between form versions.

Example:

```text
v1 fieldKey = psf_name
v2 fieldKey = psf_setup_file
v3 fieldKey = psf_setup_file_name
```

All of these should map to one canonical key:

```text
canonicalKey = psf_setup_file_name
```

### Example Mapping Table

| Form Version | Field Key | Canonical Key |
|---|---|---|
| 1 | psf_name | psf_setup_file_name |
| 2 | psf_setup_file | psf_setup_file_name |
| 3 | psf_setup_file_name | psf_setup_file_name |

### Usage

Canonical data should be used for:

```text
- Search
- Filter
- Sort
- Excel export
- Auto-fill
- Dashboard
- Reporting
```

---

## 12. Search Performance Design

### Problem

If all data is stored only as JSON and the system searches directly inside JSON, search performance may degrade as data grows, especially for frequently searched fields such as:

```text
- PSF Setup File Name
- Title
- Probecard Name
```

### Recommended Solution

Use hybrid storage:

```text
Raw JSON = flexible form data and detailed historical data
Canonical Data = normalized cross-version values
Search Index Table = fast search, filter, and sort
```

### Search Index Table

```sql
CREATE TABLE psf_request_search_index (
    request_id UUID PRIMARY KEY,
    title TEXT,
    reference_psf_name TEXT,
    psf_setup_file_name TEXT,
    probecard_name TEXT,
    status TEXT,
    priority TEXT,
    requester TEXT,
    setup_owner TEXT,
    setup_owner_role TEXT,
    product_type TEXT,
    request_date TIMESTAMP,
    due_date TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Indexes

```sql
CREATE INDEX idx_psf_setup_file_name
ON psf_request_search_index (psf_setup_file_name);

CREATE INDEX idx_title
ON psf_request_search_index (title);

CREATE INDEX idx_probecard_name
ON psf_request_search_index (probecard_name);

CREATE INDEX idx_status
ON psf_request_search_index (status);

CREATE INDEX idx_product_type
ON psf_request_search_index (product_type);

CREATE INDEX idx_setup_owner_role
ON psf_request_search_index (setup_owner_role);
```

### Search Flow

```text
User searches keyword
  ↓
Backend queries search index table
  ↓
Backend returns matched request list
  ↓
User opens request detail
  ↓
Backend loads full JSON and schema snapshot
```

---

## 13. Auto-fill Design

### Requirement

When a user enters a value that already exists in previous records, such as `Reference PSF`, `PSF Setup File Name`, or `Probecard Name`, the system should suggest or populate related fields automatically.

### Example

User enters:

```text
Reference PSF = PSF-001
```

The system may auto-fill:

```text
Probecard Name
Product
Wafer FAB
Description
Machine
```

### Design Principle

- **Canonical Keys**: Auto-fill rules must map trigger fields to target fields using canonical keys, not labels.
- **Rule-Driven Config**: Auto-fill rules are defined dynamically by administrators and stored in the database (`autofill_rules` table), requiring no code changes to add/update rules.
- **Conflict Resolution (Most Recent Match)**: If multiple completed requests share the same trigger value, the `AutofillService` retrieves target values from the most recently completed request (`completed_at DESC`).
- **User Agency**: Auto-filled values remain fully editable. The UI displays an `Auto-filled` badge and shows the source request (e.g., *"Auto-filled from REQ-0004 (latest completed)"*).

### Auto-fill API

```http
GET /api/autofill?formKey=psf-request-form&field=reference_psf_name&value=PSF-001
```

### Example Response

```json
{
  "matched": true,
  "source": "previous_completed_submission",
  "sourceRequestId": "REQ-0001",
  "suggestedValues": {
    "probecard_name": "PC-001",
    "product": "PRODUCT-A",
    "wafer_fab": "FAB-A",
    "description": "Previous setup information"
  }
}
```

### UI Behavior

- Show an `Auto-filled` badge for populated fields.
- Allow the user to edit auto-filled values.
- If the user edits an auto-filled field, mark the field as `Edited by user`.
- Show a short source message such as `Auto-filled from previous completed request`.

---

## 14. Excel Export

### Requirement

The system shall support exporting request data to Excel without being blocked by form version differences.

### Design Principles & Alignment Strategy

We use the **Latest Active Schema Alignment** strategy for Excel exports, combining administrative layouts, performance optimization, and role-based cell masking:

1. **Flat Table Layout**: The exported spreadsheet consists of a single sheet where each row represents one PSF Request.
2. **Latest Schema Column Structure**: The default column headers match the fields defined in the **latest active/published Form Schema version** of the system.
3. **Filtering Options**:
   - **Export All**: Export all requests.
   - **Filter by Specific Conditions**: Filters are restricted **strictly** to fields defined as **Canonical Keys** in the search index (e.g., `Probecard Name`, `Reference PSF Name`, `Status`, `Priority`, `Requester`, `Setup Owner`) and date parameters (enabling selection of specific Year, Month, or Date ranges for `Request Date` or `Due Date`). Dynamic, non-canonical fields cannot be used for filtering.
4. **Admin Layout Configuration**:
   - Admins can configure, reorder (via drag-and-drop), and enable/disable columns (active and obsolete fields) via the "Export Settings" admin panel.
   - Unconfigured obsolete fields default to a fallback group on the far right or are hidden based on settings.
5. **Mapping Old Requests to Latest Columns**:
   - Requests submitted on older form versions are mapped to the active columns using **Canonical Keys**.
   - If a new field exists in the latest schema but not in the old request, the cell for that request is left blank.
6. **Handling Obsolete Fields**:
   - Obsolete fields (deprecated in the latest schema) are appended to the sheet under their original historical label, based on Admin settings.
   - Obsolete columns are dynamically included **only if** at least one request in the exported subset has a value for that field. If no records contain data for a deprecated field, the column is omitted.
7. **Data Type Serialization**:
   - **Primitives (String, Number, Boolean)**: Exported as-is.
   - **Arrays (e.g., Multi-select)**: Joined into a single string with comma separation (e.g., `Product A, Product B`).
   - **Nested JSON Objects**: Extracted to specific sub-fields (like `.name`) or serialized as a simplified readable string (`key: value`).
8. **Security & Cell-Level Masking**:
   - All users share the same column layout.
   - If a user with the `Requester` role exports, columns in the `PSF Created Information` section for requests that are not yet in `PSF Created` or `Completed` status are blanked out or set to `N/A (Pending Setup)`.
9. **Date & Time Formatting**:
   - All date fields are exported in the system's default timezone (**`Asia/Bangkok` / GMT+7**).
   - Date cells are formatted as Excel Date cells in `YYYY-MM-DD` format (without time portion) so users can filter, sort, and calculate dates natively.
10. **Performance & Memory Optimization**:
    - **Synchronous Streaming (Threshold < 2,000 records)**: If the export dataset is under 2,000 records, the backend streams the spreadsheet immediately using a database cursor.
    - **Asynchronous Background Job (Threshold >= 2,000 records)**: If 2,000 or more records are requested, an async background job generates the file, and the user is notified to download it via a temporary URL.
11. **Export Filename**:
    - Filename format is `psf_requests_[YYYYMMDD_HHMMSS].xlsx` based on the system timezone.

### Example Export Columns (Default)

| Column | Source |
|---|---|
| Request No. | system.request_id |
| Product Type | system.product_type |
| Title | canonical.title |
| Reference PSF Name | canonical.reference_psf_name |
| Probecard Name | canonical.probecard_name |
| PSF Setup File Name | canonical.psf_setup_file_name |
| Status | system.status |
| Priority | canonical.priority |
| Due Date | canonical.due_date |
| Requester | system.requester |
| Setup Owner | system.setup_owner |
| Setup Owner Role | system.setup_owner_role |

### Export API

- **Query Format**:
  ```http
  GET /api/requests/export.xlsx?status=PSF_CREATED&from=2026-06-01&to=2026-06-30
  ```

---

## 15. History / Audit Log

### Purpose

The History page shows who changed data in a request, when the change occurred, which field was changed, and the old and new values.

> This History is not Form Builder History. It is the audit trail for data changes inside a request or submission.

### Design Principles

- **Key-by-Key Diffing**: Data modifications to PSF Requests are audited at the individual field level using key-by-key JSON payload diffing during write operations. Separate rows are inserted into `psf_request_audit_logs` for each modified field key, rather than storing full JSON snapshots.
- **Request-Specific Association**: Audit logs are indexed and queried using the `request_id` foreign key. The history is displayed on the request details page.
- **Dynamic Field Mapping**: If fields change between form versions, we log the `field_key` and `field_label` at the time of the change (derived from the active schema snapshot), ensuring history remains readable.

### Audit Log Should Track

```text
- Who changed the data
- When the change occurred
- Which field changed
- Old value
- New value
- Action type
- User role
- Status change
- Attachment upload or deletion
- Auto-fill usage
```

### Example Audit Table

| Time | User | Action | Field | Old Value | New Value |
|---|---|---|---|---|---|
| 2026-06-10 14:10 | requester01 | CREATE_REQUEST | Status | - | Submitted |
| 2026-06-10 14:30 | setup01 | UPDATE_FIELD | PSF Setup File Name | - | PSF_ABC_001 |
| 2026-06-10 14:35 | setup01 | CHANGE_STATUS | Status | Setup In Progress | PSF Created |
| 2026-06-10 14:36 | setup01 | UPLOAD_ATTACHMENT | Template | - | template.xlsx |

### Audit Log Table

```sql
CREATE TABLE psf_request_audit_logs (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    action_type TEXT NOT NULL,
    field_key TEXT,
    field_label TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT NOT NULL,
    changed_by_role TEXT,
    changed_at TIMESTAMP NOT NULL,
    reason TEXT,
    metadata_json JSONB
);
```

### Action Types

```text
CREATE_REQUEST
UPDATE_FIELD
CHANGE_STATUS
UPLOAD_ATTACHMENT
DELETE_ATTACHMENT
USE_AUTOFILL
MARK_PSF_CREATED
EXPORT_EXCEL
ADMIN_OVERRIDE
```

---

## 16. Admin Page

### Purpose

The Admin page allows authorized users to configure and maintain the system.

### Admin Modules

```text
Admin
├── User & Role Management
├── Form Configuration (includes Schema-Embedded Master Data)
├── Workflow / Status Configuration
├── Field Visibility Rules
├── Auto-fill Rules
├── Export Settings
└── System Settings
```

### User & Role Management

- Add or update user roles.
- Assign Requester, Setup Owner (Setup File Owner), and Admin roles.
- Control which requests each role can access.

### Form Configuration & Schema-Embedded Master Data

- **JSON Schema Editor**: Admins configure forms using an integrated Monaco/CodeMirror JSON Schema Editor with syntax highlighting, template boilerplate injection, and validation checks.
- **Visual Preview**: A side-by-side split screen renders a live draft preview of the form based on the edited JSON.
- **Embedded Master Data**: Dropdown options for master data (Products, Wafer FABs, Priority, Machines, etc.) are embedded directly within the dynamic JSON Form Schema definition (`options` array) rather than requiring separate database lookup tables and CRUD admin screens.

### Workflow Configuration

- Configure statuses.
- Configure allowed status transitions.
- Configure which roles can update each status.

Example:

```text
Submitted -> Setup In Progress: Setup Owner / Admin
Setup In Progress -> PSF Created: Setup Owner / Admin
PSF Created -> Completed: Setup Owner / Admin
```

---

## 17. Backend API Service

### Recommended Term

The central server-side layer should be called:

```text
Backend API Service
```

The term **middleware** alone may be too narrow because this layer contains significant business logic.

### Responsibilities

```text
- Authentication and authorization (Local Auth with Bcrypt)
- Form schema management & validation
- Submission processing & optimistic locking
- Workflow status control (Manual status transitions)
- Canonical mapping (Write-time canonical extraction)
- Search index updates (psf_request_search_index table)
- Auto-fill rule suggestion & duplicate match resolution
- Excel export generation (Streaming / Async Background)
- Field-level audit logging (Key-by-key JSON diff)
- Attachment handling (Local filesystem storage with database metadata)
```

### Recommended Stack

```text
Frontend: React / TanStack Start / Vite / TypeScript / Tailwind
Backend API: NestJS + TypeScript
Database: PostgreSQL + JSONB
Search: PostgreSQL indexed table (psf_request_search_index)
Reverse Proxy: Nginx
Excel Export: Backend-generated .xlsx
```

### Recommended Choice

For development velocity, shared TypeScript models, and dynamic schema parsing, we chose:

```text
NestJS + PostgreSQL + Nginx
```

---

## 18. Backend Module Structure

```text
backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── local-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── requests/
│   │   ├── requests.module.ts
│   │   ├── requests.controller.ts
│   │   ├── requests.service.ts
│   │   ├── search-index.service.ts
│   │   └── autofill.service.ts
│   ├── audit/
│   │   ├── audit.module.ts
│   │   └── audit_log.service.ts
│   ├── export/
│   │   ├── export.module.ts
│   │   ├── export.controller.ts
│   │   └── excel_export.service.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   └── schema.entities.ts
│   └── admin/
│       ├── admin.module.ts
│       ├── admin.controller.ts
│       └── form_schema.service.ts
```

---

## 19. API Design

### Auth

```http
POST /api/auth/login
POST /api/auth/logout
GET /api/me
```

### Dashboard

```http
GET /api/dashboard/summary
GET /api/requests?keyword=&status=&priority=&from=&to=
```

### Requests / Form

```http
POST /api/requests
GET /api/requests/{requestId}
PUT /api/requests/{requestId}
POST /api/requests/{requestId}/submit
POST /api/requests/{requestId}/start-setup
PUT /api/requests/{requestId}/psf-created
POST /api/requests/{requestId}/mark-psf-created
POST /api/requests/{requestId}/complete
```

### History

```http
GET /api/requests/{requestId}/history
GET /api/audit-logs?requestId=&user=&actionType=&from=&to=
```

### Auto-fill

```http
GET /api/autofill?formKey=&field=&value=
```

### Export

```http
GET /api/requests/export.xlsx?status=&from=&to=
```

### Admin

```http
GET /api/admin/users
PUT /api/admin/users/{userId}/role
GET /api/admin/master-data
POST /api/admin/master-data
GET /api/admin/form-config
PUT /api/admin/form-config
POST /api/admin/form-config/publish
GET /api/admin/workflow
PUT /api/admin/workflow
GET /api/admin/export-profile
PUT /api/admin/export-profile
```

---

## 20. Database Design

### form_definitions

```sql
CREATE TABLE form_definitions (
    id UUID PRIMARY KEY,
    form_key TEXT NOT NULL,
    version INT NOT NULL,
    title TEXT,
    description TEXT,
    schema_json JSONB NOT NULL,
    status TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMP NOT NULL,
    published_at TIMESTAMP
);
```

### psf_requests

```sql
CREATE TABLE psf_requests (
    id UUID PRIMARY KEY,
    request_no TEXT UNIQUE NOT NULL,
    form_key TEXT NOT NULL,
    form_version INT NOT NULL,
    status TEXT NOT NULL,
    requester TEXT NOT NULL,
    setup_owner TEXT,
    setup_owner_role TEXT,
    product_type TEXT NOT NULL,
    requester_data_json JSONB NOT NULL,
    psf_created_data_json JSONB,
    schema_snapshot_json JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    submitted_at TIMESTAMP,
    psf_created_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

### field_mappings

```sql
CREATE TABLE field_mappings (
    id UUID PRIMARY KEY,
    form_key TEXT NOT NULL,
    form_version INT NOT NULL,
    field_key TEXT NOT NULL,
    canonical_key TEXT NOT NULL
);
```

### canonical_submission_values

```sql
CREATE TABLE canonical_submission_values (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    canonical_key TEXT NOT NULL,
    value TEXT,
    updated_at TIMESTAMP NOT NULL
);
```

### psf_request_search_index

```sql
CREATE TABLE psf_request_search_index (
    request_id UUID PRIMARY KEY,
    request_no TEXT,
    title TEXT,
    reference_psf_name TEXT,
    psf_setup_file_name TEXT,
    probecard_name TEXT,
    product TEXT,
    wafer_fab TEXT,
    status TEXT,
    priority TEXT,
    requester TEXT,
    setup_owner TEXT,
    setup_owner_role TEXT,
    product_type TEXT,
    request_date TIMESTAMP,
    due_date TIMESTAMP,
    updated_at TIMESTAMP
);
```

### psf_request_audit_logs

```sql
CREATE TABLE psf_request_audit_logs (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    action_type TEXT NOT NULL,
    field_key TEXT,
    field_label TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT NOT NULL,
    changed_by_role TEXT,
    changed_at TIMESTAMP NOT NULL,
    reason TEXT,
    metadata_json JSONB
);
```

### autofill_rules

```sql
CREATE TABLE autofill_rules (
    id UUID PRIMARY KEY,
    form_key TEXT NOT NULL,
    trigger_canonical_key TEXT NOT NULL,
    lookup_source TEXT NOT NULL,
    fill_targets_json JSONB NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
```

### export_profiles

```sql
CREATE TABLE export_profiles (
    id UUID PRIMARY KEY,
    form_key TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    columns_json JSONB NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
```

---

## 21. State Persistence

### Login Session

```text
Use HttpOnly Secure Cookie + backend validation
```

### Frontend Data Persistence

| Data | Recommended Storage |
|---|---|
| Login session | HttpOnly Secure Cookie |
| User profile | Backend + memory/session cache |
| ---

## 22. Frontend Pages and Route Structure

The application contains five main pages accessible via a global navigation menu. The term **PSF Requests** is preferred over only **Form**, because the page is not only a form. It includes request creation, request detail, workflow status, attachments, and update actions.

Recommended navigation labels:
- Dashboard
- PSF Requests
- History
- Admin

The corresponding directory structure for routing (using TanStack Router / file-based routing) is as follows:

```text
/routes
├── login
│   └── index.tsx
├── dashboard
│   └── index.tsx
├── requests
│   ├── index.tsx
│   ├── new.tsx
│   └── $requestId
│       ├── index.tsx
│       └── history.tsx
├── history
│   └── index.tsx
└── admin
    ├── index.tsx
    ├── users.tsx
    ├── master-data.tsx
    ├── form-config.tsx
    ├── workflow.tsx
    ├── autofill.tsx
    └── export-profile.tsx
```

---

## 23. UI/UX Recommendations

### General UI

- Use a section/card layout instead of copying an Excel-like layout directly.
- Use a responsive grid for PC and tablet.
- Show the current status clearly in the page header.
- Required fields should be visually clear.
- Error messages should appear close to the related field.
- The PSF Created section should show a placeholder when the requester cannot view the content yet.

### Suggested Status Text

Use user-friendly status labels:

```text
Waiting for PSF setup
Setup in progress
PSF created
Completed
Need more information
```

### Auto-fill UI

- Show an `Auto-filled` badge.
- If the user edits an auto-filled value, show `Edited by user`.
- Show a short source note such as `Auto-filled from previous completed request`.

### History UI

- Display history as a timeline or table.
- Allow filtering by action type, user, and date.
- Show old value and new value for each field-level change.

---

## 24. Functional Requirements Summary

### FR-001 Login [Must Have]

The system shall require users to log in before accessing the application.

### FR-002 Role-Based Access [Must Have]

The system shall control page access, field visibility, and actions based on user role.

### FR-003 Dashboard [Must Have]

The system shall provide a dashboard showing PSF request summaries and request list.

### FR-004 Create Request [Must Have]

The system shall allow requesters to create and submit PSF requests.

### FR-005 PSF Created Visibility [Must Have]

The system shall hide PSF Created Information from the requester until the request status is updated to PSF Created.

### FR-006 Setup Owner Update [Must Have]

The system shall allow setup file owners to update PSF Created Information.

### FR-007 Status Workflow [Must Have]

The system shall support workflow statuses including Draft, Submitted, Setup In Progress, PSF Created, and Completed.

### FR-008 Search [Must Have]

The system shall support searching by Title, PSF Setup File Name, Probecard Name, and Reference PSF Name.

### FR-009 Search Performance [Must Have]

The system shall use indexed searchable fields or a search index table for frequently searched fields.

### FR-010 Auto-fill [Should Have]

The system shall support auto-fill suggestions based on previously completed or validated requests.

### FR-011 Excel Export [Must Have]

The system shall support exporting request data to Excel using canonical field mapping.

### FR-012 History / Audit Log [Must Have]

The system shall record field-level data changes, including who changed the data, when the change occurred, the old value, and the new value.

### FR-013 Admin Configuration [Should Have]

The system shall provide admin functions for managing users, roles, form configuration, workflow, auto-fill rules, and export settings.

### FR-014 Form Versioning [Should Have]

The system shall store form version and schema snapshot with each request.

### FR-015 Canonical Mapping [Should Have]

The system shall use canonical field keys to normalize data across form versions.

---

## 25. Non-Functional Requirements

### Performance

- Search should use indexed columns or a search index table.
- Dashboard should not load full JSON for every request.
- The detail page should load full JSON only when a user opens a request.

### Security

- Login session should be validated by the backend.
- Sensitive tokens should not be stored in localStorage.
- Role and permission must be enforced by the backend.
- Audit logs should not be editable by normal users.

### Maintainability

- Separate frontend, backend, service layer, and repository layer.
- Keep form schema configurable.
- Keep field mapping explicit.
- Keep audit log separate from form builder history.

### Scalability

- Start with PostgreSQL indexes.
- Add an external search engine only when needed.

---

## 26. Final Recommended Architecture

```text
React Frontend
  ↓
Nginx Reverse Proxy
  ↓
Backend API Service
  ├── Auth Middleware
  ├── Role Guard
  ├── Form Schema Service
  ├── Request Service
  ├── Workflow Service
  ├── Canonical Mapping Service
  ├── Search Index Service
  ├── Auto-fill Service
  ├── Excel Export Service
  └── Audit Log Service
  ↓
PostgreSQL
  ├── form_definitions
  ├── psf_requests
  ├── field_mappings
  ├── canonical_submission_values
  ├── psf_request_search_index
  ├── psf_request_audit_logs
  ├── autofill_rules
  └── export_profiles
```
