# 11. Key-by-Key Diff Request-Specific Audit Logging

We decided that data modifications to PSF Requests will be audited at the individual field level using key-by-key JSON payload diffing during write operations. These audit records will be stored in a flat relational table and queried specifically on a per-request basis.

## Context

Because requests utilize dynamic schemas, their data payload is stored in flexible JSONB fields. We need to present a detailed history timeline when a user inspects a specific request, showing exactly which fields were changed, by whom, and what the previous and new values were. We need to choose between saving full JSON snapshots or doing a granular diff.

## Decision

We chose a Key-by-Key Diff Audit strategy scoped per request:
- **Granular Database Logging**: When a request is updated, the backend (`AuditLogService` in NestJS) will compare the incoming JSON body with the existing record. For each key that has been added, modified, or deleted, a separate row is inserted into the `psf_request_audit_logs` table.
- **Request-Specific Association**: All audit entries will be indexed and queried using the `request_id` foreign key. The history is displayed on the request details page (e.g., in a "History" tab or timeline view) showing the timeline of events for that request only.
- **Dynamic Field Mapping**: If a field changes between form versions, we log the `field_key` and its human-readable `field_label` at the time of the change (derived from the active schema snapshot), ensuring that history is readable even if the schema changes later.
- **Benefits**:
  - **Simplicity on Frontend**: The frontend only needs to fetch `GET /api/requests/{requestId}/history` and render a simple list of change rows. It does not need to run complex JSON diff algorithms in the browser.
  - **Performance**: Querying audit history for a single request is highly efficient since we filter on `request_id` which is a primary/foreign key.
