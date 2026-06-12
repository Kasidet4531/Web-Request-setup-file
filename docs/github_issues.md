# GitHub Issues List: PSF Setup File Request Management

This document contains the refined GitHub issues for the vertical slices defined for the PSF Setup File Request Management project. These issues are designed as end-to-end tracer bullets.

---

## #1: Database Setup and Local Authentication

### What to build

Set up the PostgreSQL database configuration on the NestJS backend and local username/password validation using bcrypt. Configure session management using HttpOnly Secure cookies. Build the login page on the React frontend that integrates with this authentication system.

### Acceptance criteria

- [ ] NestJS backend successfully connects to PostgreSQL.
- [ ] Login endpoint `POST /api/auth/login` validates credentials against stored user passwords (using bcrypt hashing) and sets a secure, HttpOnly session cookie.
- [ ] Logout endpoint `POST /api/auth/logout` clears the session cookie.
- [ ] Profile endpoint `GET /api/me` returns the authenticated user's profile and assigned role.
- [ ] Frontend `/login` route renders a login screen, stores session state in memory (not localStorage), and retains logged-in state after page refresh via `GET /api/me`.

### Blocked by

None - can start immediately

---

## #2: Admin JSON Schema Form Configurator & Live Preview

### What to build

Create the `form_definitions` database table. Implement the Admin Form Configurator page (`/admin/form-config`) featuring a JSON Schema editor side-by-side with a live-rendering draft preview of the form fields. Support embedding master data dropdown options directly in the JSON Schema.

### Acceptance criteria

- [ ] Backend table `form_definitions` is created.
- [ ] API endpoints `GET /api/admin/form-config` and `PUT /api/admin/form-config` allow retrieving and saving/publishing active form schemas.
- [ ] Admin form config UI features a Monaco/CodeMirror JSON editor with split-screen preview.
- [ ] Embedded master data (like Products, Wafer FABs, Machines) populated inside the schema JSON is correctly parsed and rendered in the preview dropdowns.

### Blocked by

- #1

---

## #3: PSF Request Creation & Draft Persistence

### What to build

Build the `psf_requests` database table and APIs for saving draft requests. Create the Request creation form (`/requests/new`) displaying fields dynamically from the active schema definition (including the mandatory Product Type radio buttons at the top).

### Acceptance criteria

- [ ] Backend table `psf_requests` is created.
- [ ] APIs `POST /api/requests` and `GET /api/requests/{requestId}` allow creating and loading a request.
- [ ] Requester can fill out the form fields dynamically rendered from the active form schema definition.
- [ ] Requester can save the request as a Draft, and reload it later.

### Blocked by

- #2

---

## #4: Form Submission & Schema Snapshot Locking

### What to build

Implement request submission API that locks the form by storing the current form version schema snapshot in the request record. This prevents later schema modifications from breaking historical request formatting.

### Acceptance criteria

- [ ] Endpoint `POST /api/requests/{requestId}/submit` updates status to `Submitted` and saves the current form version schema definition to `schema_snapshot_json`.
- [ ] Once submitted, the fields in the Requester Information section are read-only for the requester.
- [ ] Submitting a request locks the request to its schema snapshot version permanently.

### Blocked by

- #3

---

## #5: Draft Version Upgrade Hybrid Flow & Canonical Mapping

### What to build

Create database table `field_mappings`. Implement a hybrid schema upgrade flow for draft requests. When a user opens a draft request that uses an older schema version, prompt them with a dialog to upgrade to the latest active schema version (preserving matching fields) or remain on the old version. Save field mapping to canonical keys on submit.

### Acceptance criteria

- [ ] Backend table `field_mappings` is created.
- [ ] Opening an old draft triggers a confirmation dialog prompting the user to Upgrade or Remain.
- [ ] Upgrading migrates the draft fields to the latest active schema version, preserving matching keys, discarding obsolete ones, and initializing new fields.
- [ ] Submitting a request extracts canonical field keys based on the current field mapping configuration.

### Blocked by

- #3

---

## #6: Dashboard Queue & Canonical Search Index

### What to build

Setup `psf_request_search_index` database table. On request creation/submission, extract canonical field values into this search index. Implement the Dashboard page (`/dashboard`) with summary count cards and a request list table showing key columns (e.g. Request No., Product Type, Title, Status, Priority, Setup Owner, Due Date).

### Acceptance criteria

- [ ] Table `psf_request_search_index` is created and kept in sync with the requests table.
- [ ] Search query API `GET /api/requests` filters by keyword (Title, Probecard Name, Reference PSF Name) and filters by Status, Priority, Setup Owner Role, and Product Type.
- [ ] Dashboard displays summary cards (Total Requests, Waiting for Setup, Setup In Progress, PSF Created, Completed, Overdue).
- [ ] Dashboard list pre-filters requests for Setup Owners to show only pending setup requests.

### Blocked by

- #4
- #5

---

## #7: Manual Workflow Transitions & Setup Owner Auto-Assignment

### What to build

Add a workflow status dropdown control to the request details page. Allow users with transition permission to update status based on role-based transitions. Automatically record the Setup File Owner and their department (GNTC or MFG) when they modify the request status.

### Acceptance criteria

- [ ] Detail page `/requests/{requestId}` renders status dropdown control.
- [ ] Status dropdown is only editable by users with appropriate transition permissions for the current status. Users without permission see the status in read-only mode.
- [ ] When a Setup File Owner changes the status, they are automatically associated with the request (setting `setupOwner` and `setupOwnerRole`).
- [ ] Role-based transition constraints are enforced: only permitted roles can transition to specific statuses.

### Blocked by

- #6

---

## #8: PSF Created Information Fields & Requester Visibility Masking

### What to build

Implement the "PSF Created Information" section in the request detail form. Setup visibility rules: hide this section from Requesters (replacing it with a friendly placeholder message) until the request status becomes `PSF Created` or `Completed`.

### Acceptance criteria

- [ ] Setup File Owners can view and edit the "PSF Created Information" section.
- [ ] Requesters see a placeholder message ("PSF setup information is not available yet...") when request status is below `PSF Created`.
- [ ] Requesters can see the completed PSF Created section in read-only mode when status is `PSF Created` or `Completed`.

### Blocked by

- #7

---

## #9: Workflow Status Transition Email Notifications

### What to build

Build the automated email notification system that dispatches emails on submission and status changes. Ensure failures to send emails do not block database transactions or request processing.

### Acceptance criteria

- [ ] When status changes to `Submitted`, dispatch an email to all Setup File Owners (GNTC and MFG) with request metadata and a direct CTA link.
- [ ] When request status is manually updated, dispatch an email notification to the original Requester and all Setup File Owners showing the new status and who performed the change.
- [ ] Email dispatch failures are logged cleanly without blocking request state transitions.

### Blocked by

- #7

---

## #10: Rule-driven Auto-fill & Most-Recent-Completed Matching

### What to build

Create `autofill_rules` database table and `/admin/autofill` configurator page. Build `AutofillService` resolving triggers to target fields based on the most recently completed request. Embed auto-fill indicators in the form UI.

### Acceptance criteria

- [ ] Admin can define triggers and target fields using canonical keys.
- [ ] Typing a trigger value (e.g. Reference PSF) fetches matching completed values from the database using `completed_at DESC`.
- [ ] Renders an "Auto-filled" badge or "Edited by user" label depending on whether the user overrides the suggested values.

### Blocked by

- #8

---

## #11: Key-by-key Field Audit Logs & Timeline

### What to build

Implement `psf_request_audit_logs` database table. Add field-level JSON diffing logic to record audit trails of all field modifications. Build a history timeline component on the details page.

### Acceptance criteria

- [ ] Field-level updates are recorded in `psf_request_audit_logs` as individual diff entries on write (action types like `CREATE_REQUEST`, `UPDATE_FIELD`, `CHANGE_STATUS`, etc.).
- [ ] Audit logs record the changer, timestamp, field label, old value, and new value.
- [ ] History timeline renders modifications chronologically.

### Blocked by

- #7

---

## #12: Excel Export Alignment, Data Serialization & Masking

### What to build

Build Excel Export API using the Latest Active Schema Alignment strategy. Format cells (timezone `Asia/Bangkok`), serialize multi-select arrays, mask cells for Requester role if request status is below `PSF Created`, and run asynchronous background exports for queries returning >= 2,000 records.

### Acceptance criteria

- [ ] Export API returns an `.xlsx` file aligning historical records to the latest schema using canonical keys.
- [ ] Export filenames match the format `psf_requests_[YYYYMMDD_HHMMSS].xlsx` based on GMT+7.
- [ ] Cells in the PSF Created section are blanked out/masked if a Requester exports a request that is not yet `PSF Created` or `Completed`.
- [ ] Generates async downloads with a temporary URL for sets of 2,000+ records.

### Blocked by

- #6
- #8

---

## #13: Admin Panel: User & Role Management

### What to build

Create the `/admin/users` screen to allow administrators to assign, change, or update user roles and department associations.

### Acceptance criteria

- [ ] Admin can view the list of all users and their details.
- [ ] Admin can change user roles (e.g., Requester, Setup Owner, Admin).
- [ ] Admin can assign Setup Owners to departments (GNTC or MFG).

### Blocked by

- #1

---

## #14: Admin Panel: Workflow Status Transition Editor

### What to build

Create the `/admin/workflow` screen. Allow administrators to configure and define allowed status transitions and map authorization constraints on who can transition statuses.

### Acceptance criteria

- [ ] Admin can define workflow statuses and state transitions.
- [ ] Admin can define which user roles/departments are allowed to perform specific transitions.
- [ ] Changes are saved to database and immediately respected by the manual transition validation logic.

### Blocked by

- #7
- #13

---

## #15: Admin Panel: Export Column & Profile Configurator

### What to build

Create the `/admin/export-profile` screen. Provide a user interface allowing administrators to customize columns and ordering profile settings for Excel exports.

### Acceptance criteria

- [ ] Admin can configure which active/obsolete fields are included in the export.
- [ ] Admin can reorder columns via a drag-and-drop column selector interface.
- [ ] Export profiles can be marked as default.

### Blocked by

- #12
- #13
