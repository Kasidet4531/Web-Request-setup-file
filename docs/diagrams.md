# PSF Setup File — System Diagrams

> Visual diagrams for the PSF Setup File Web Application architecture.
> All diagrams use [Mermaid](https://mermaid.js.org/) syntax and can be rendered in GitHub, GitLab, VS Code, and most modern Markdown viewers.

---

## Table of Contents

- [0. System Architecture](#0-system-architecture)
  - [0.1 Deployment Architecture](#01-deployment-architecture)
  - [0.2 Component Architecture](#02-component-architecture)
  - [0.3 Data Architecture](#03-data-architecture)
  - [0.4 Write Pipeline](#04-write-pipeline)
- [1. System Data Flow](#1-system-data-flow)
- [2. Request Lifecycle State Machine](#2-request-lifecycle-state-machine)
- [3. Sequence Diagrams](#3-sequence-diagrams)
  - [3.1 Login Flow](#31-login-flow)
  - [3.2 Create & Submit PSF Request](#32-create--submit-psf-request)
  - [3.3 Setup Owner Completes PSF Created Information](#33-setup-owner-completes-psf-created-information)
  - [3.4 Auto-fill Flow](#34-auto-fill-flow)
  - [3.5 Excel Export Flow](#35-excel-export-flow)
  - [3.6 Admin: Publish New Form Version](#36-admin-publish-new-form-version)
- [4. Database ER Diagram](#4-database-er-diagram)
- [5. Backend Module Dependency](#5-backend-module-dependency)

---

## 0. System Architecture

> **This is the primary reference diagram for the PSF Setup File system.**
> It shows the deployment topology, component boundaries, data strategy, and cross-cutting concerns.

### 0.1 Deployment Architecture

Three-tier deployment with security boundaries: **Client → Reverse Proxy → Application → Database**.

```mermaid
graph TB
    %% ── Client Tier ──────────────────────────────
    subgraph ClientTier["🌐 Client Tier"]
        direction TB
        Browser["Web Browser<br/>(Chrome / Edge)"]
    end

    %% ── DMZ / Reverse Proxy Tier ─────────────────
    subgraph ProxyTier["🔒 DMZ — Reverse Proxy Tier"]
        direction TB
        NGINX["Nginx<br/>Reverse Proxy"]
        STATIC["Static Assets<br/>(React Build: JS/CSS/HTML)"]
        NGINX -- "Serve /static/*" --> STATIC
    end

    %% ── Application Tier ─────────────────────────
    subgraph AppTier["⚙️ Application Tier"]
        direction TB
        NESTJS["NestJS Backend<br/>(Node.js Runtime)"]

        subgraph Guards["Cross-Cutting Concerns"]
            AUTH_GUARD["AuthGuard<br/>(Session Cookie)"]
            ROLES_GUARD["RolesGuard<br/>(RBAC)"]
            VALIDATION["ValidationPipe<br/>(Schema Validation)"]
        end

        subgraph DomainModules["Domain Modules"]
            direction LR
            AUTH_MOD["Auth<br/>Module"]
            REQ_MOD["Requests<br/>Module"]
            ADMIN_MOD["Admin<br/>Module"]
            AUDIT_MOD["Audit<br/>Module"]
            EXPORT_MOD["Export<br/>Module"]
        end

        subgraph WriteServices["Write-Path Services"]
            direction LR
            SEARCH_SVC["Search Index<br/>Service"]
            CANONICAL_SVC["Canonical<br/>Extraction"]
            AUTOFILL_SVC["AutoFill<br/>Service"]
            DIFF_SVC["Key-by-Key<br/>Diff Engine"]
        end

        NESTJS --> Guards
        Guards --> DomainModules
        DomainModules --> WriteServices
    end

    %% ── Data Tier ────────────────────────────────
    subgraph DataTier["🗄️ Data Tier"]
        direction TB
        PG[("PostgreSQL<br/>Database")]
        FS["📁 Local Filesystem<br/>(Attachments)"]
    end

    %% ── Connections ──────────────────────────────
    Browser -- "HTTPS<br/>Port 443" --> NGINX
    NGINX -- "Proxy /api/*<br/>+ HttpOnly Cookie" --> NESTJS
    NESTJS -- "SQL + JSONB<br/>Queries" --> PG
    NESTJS -- "Read/Write<br/>Files" --> FS

    %% ── Styling ──────────────────────────────────
    classDef tierClient fill:#E3F2FD,stroke:#1565C0,stroke-width:2px,color:#0D47A1
    classDef tierProxy fill:#FFF3E0,stroke:#E65100,stroke-width:2px,color:#BF360C
    classDef tierApp fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    classDef tierData fill:#F3E5F5,stroke:#6A1B9A,stroke-width:2px,color:#4A148C

    class ClientTier tierClient
    class ProxyTier tierProxy
    class AppTier tierApp
    class DataTier tierData
```

**Key Architecture Decisions reflected here:**

| Concern | Decision | ADR |
|---|---|---|
| Backend Framework | NestJS + TypeScript | [ADR-0001](../docs/adr/0001-nestjs-postgresql-backend.md) |
| Authentication | Local DB auth, Bcrypt, HttpOnly cookie | [ADR-0006](../docs/adr/0006-local-database-authentication.md) |
| Attachment Storage | Local filesystem (abstracted for S3 migration) | [ADR-0008](../docs/adr/0008-local-filesystem-attachment-storage.md) |
| Form Admin | JSON Schema Editor (Monaco/CodeMirror) | [ADR-0007](../docs/adr/0007-admin-json-schema-editor.md) |

---

### 0.2 Component Architecture

Internal view of how backend modules, services, and cross-cutting guards interact.

```mermaid
graph TB
    %% ── HTTP Entry ───────────────────────────────
    HTTP_IN(("HTTP Request<br/>/api/*"))

    %% ── Guards Pipeline ──────────────────────────
    subgraph GuardsPipeline["Guards Pipeline (per-request)"]
        direction LR
        G1["1. AuthGuard<br/>Validate Session"]
        G2["2. RolesGuard<br/>Check RBAC"]
        G3["3. ValidationPipe<br/>DTO/Schema Check"]
        G1 --> G2 --> G3
    end

    %% ── Controllers ──────────────────────────────
    subgraph Controllers["Controllers (Route Handlers)"]
        direction LR
        AUTH_C["AuthController<br/>/api/auth/*"]
        REQ_C["RequestsController<br/>/api/requests/*"]
        ADMIN_C["AdminController<br/>/api/admin/*"]
        EXPORT_C["ExportController<br/>/api/requests/export.*"]
    end

    %% ── Core Services ────────────────────────────
    subgraph CoreServices["Core Domain Services"]
        direction TB
        AUTH_S["AuthService<br/>Login / Logout / Session"]
        REQ_S["RequestsService<br/>CRUD + Workflow"]
        FORM_S["FormSchemaService<br/>Version / Publish"]
        EXPORT_S["ExcelExportService<br/>Stream / Background"]
    end

    %% ── Write-Path Services ──────────────────────
    subgraph WritePath["Write-Path Services (triggered on mutation)"]
        direction TB
        SEARCH_S["SearchIndexService<br/>→ psf_request_search_index"]
        CANON_S["CanonicalExtractionService<br/>→ canonical_submission_values"]
        DIFF_S["AuditLogService<br/>Key-by-key JSON diff<br/>→ psf_request_audit_logs"]
        AUTOFILL_S["AutofillService<br/>Most-recent match lookup"]
    end

    %% ── Data Access ──────────────────────────────
    subgraph DataAccess["Data Access Layer"]
        direction LR
        REPO_REQ["RequestsRepository"]
        REPO_FORM["FormDefinitionsRepository"]
        REPO_AUDIT["AuditLogsRepository"]
        REPO_EXPORT["ExportProfilesRepository"]
    end

    %% ── Database ─────────────────────────────────
    DB[("PostgreSQL")]

    %% ── Connections ──────────────────────────────
    HTTP_IN --> GuardsPipeline
    GuardsPipeline --> Controllers

    AUTH_C --> AUTH_S
    REQ_C --> REQ_S
    ADMIN_C --> FORM_S
    EXPORT_C --> EXPORT_S

    REQ_S --> SEARCH_S
    REQ_S --> CANON_S
    REQ_S --> DIFF_S
    REQ_S --> AUTOFILL_S
    EXPORT_S --> SEARCH_S

    AUTH_S --> DataAccess
    REQ_S --> DataAccess
    FORM_S --> DataAccess
    EXPORT_S --> DataAccess
    DIFF_S --> DataAccess

    DataAccess --> DB
```

---

### 0.3 Data Architecture

The system uses a **Hybrid Data Strategy** combining flexible JSONB storage with fast indexed columns.
This is one of the most important architectural decisions in the system.

```mermaid
graph LR
    subgraph SourceOfTruth["🏛️ Source of Truth"]
        REQ_TABLE["psf_requests<br/><br/>product_type (TEXT)<br/>setup_owner_role (TEXT)<br/>requester_data_json (JSONB)<br/>psf_created_data_json (JSONB)<br/>schema_snapshot_json (JSONB)"]
    end

    subgraph DerivedData["📊 Derived Data (Write-Time Extraction)"]
        direction TB
        SEARCH["psf_request_search_index<br/><br/>Flat columns: product_type, setup_owner_role,<br/>title, probecard_name, psf_setup_file_name, status, ...<br/><br/>🔍 Fast Search / Filter / Sort"]
        CANONICAL["canonical_submission_values<br/><br/>canonical_key → value pairs<br/><br/>🔗 Cross-version field mapping"]
    end

    subgraph MappingLayer["🗺️ Mapping Layer"]
        FIELD_MAP["field_mappings<br/><br/>form_key + version + field_key<br/>→ canonical_key<br/><br/>📌 Version-safe field identity"]
    end

    subgraph AuditTrail["📋 Audit Trail"]
        AUDIT["psf_request_audit_logs<br/><br/>Per-field change records:<br/>field_key, old_value, new_value,<br/>changed_by, action_type<br/><br/>📝 Key-by-key diff"]
    end

    subgraph Config["⚙️ Configuration"]
        direction TB
        FORMS["form_definitions<br/>(Schema versions)"]
        AUTOFILL["autofill_rules<br/>(Trigger → fill targets)"]
        EXPORT["export_profiles<br/>(Column layout)"]
    end

    %% Write-time extraction flow
    REQ_TABLE -- "On Submit /<br/>On PSF Created" --> SEARCH
    REQ_TABLE -- "On Submit /<br/>On PSF Created" --> CANONICAL
    FIELD_MAP -- "Resolve<br/>canonical_key" --> CANONICAL
    REQ_TABLE -- "On Mutation<br/>(key-by-key diff)" --> AUDIT

    %% Read paths
    SEARCH -. "Dashboard Search<br/>Excel Export Filter" .-> REQ_TABLE
    CANONICAL -. "Auto-fill Lookup<br/>Export Column Mapping" .-> REQ_TABLE
    FORMS -. "Schema for<br/>form rendering" .-> REQ_TABLE

    classDef source fill:#BBDEFB,stroke:#1565C0,stroke-width:2px
    classDef derived fill:#C8E6C9,stroke:#2E7D32,stroke-width:2px
    classDef mapping fill:#FFE0B2,stroke:#E65100,stroke-width:2px
    classDef audit fill:#F8BBD0,stroke:#C2185B,stroke-width:2px
    classDef config fill:#E1BEE7,stroke:#7B1FA2,stroke-width:2px

    class REQ_TABLE source
    class SEARCH,CANONICAL derived
    class FIELD_MAP mapping
    class AUDIT audit
    class FORMS,AUTOFILL,EXPORT config
```

**Key principle:**
- **JSONB is the source of truth** — raw form data is never lost.
- **Derived tables are populated at write time** (not query time) — guarantees O(1) search performance.
- **Canonical keys bridge form versions** — version 1 `psf_name` and version 3 `psf_setup_file_name` resolve to the same canonical key.

---

### 0.4 Write Pipeline

Shows the critical path when a PSF Request is created or updated — the chain of services triggered at write time.

```mermaid
flowchart LR
    A["Client submits<br/>POST /api/requests/{id}/submit"] --> B["RequestsService<br/>validate(schema, payload)"]

    B --> C{"Validation<br/>passed?"}
    C -- No --> ERR["❌ 400 Bad Request<br/>Return validation errors"]
    C -- Yes --> D["Save to psf_requests<br/>(JSONB payload + status)"]

    D --> E["Canonical Extraction"]
    E --> E1["Read field_mappings<br/>for form_key + version"]
    E1 --> E2["UPSERT canonical_submission_values<br/>(canonical_key → value)"]

    D --> F["Search Index Update"]
    F --> F1["Extract searchable fields<br/>via canonical keys"]
    F1 --> F2["UPSERT psf_request_search_index<br/>(flat indexed columns)"]

    D --> G["Audit Logging"]
    G --> G1["Diff old vs new JSON<br/>(key-by-key comparison)"]
    G1 --> G2["INSERT psf_request_audit_logs<br/>(one row per changed field)"]

    E2 --> H["✅ 200 OK<br/>Return updated request"]
    F2 --> H
    G2 --> H

    classDef start fill:#E3F2FD,stroke:#1565C0,stroke-width:2px
    classDef process fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px
    classDef error fill:#FFCDD2,stroke:#C62828,stroke-width:2px
    classDef success fill:#C8E6C9,stroke:#1B5E20,stroke-width:2px
    classDef extract fill:#FFF9C4,stroke:#F57F17,stroke-width:2px

    class A start
    class B,D process
    class ERR error
    class H success
    class E,E1,E2,F,F1,F2,G,G1,G2 extract
```

---

## 1. System Data Flow

High-level data flow between actors, the frontend, backend, and the database layer.

```mermaid
flowchart TB
    subgraph Actors
        REQ["👤 Requester"]
        SFO["👤 Setup File Owner"]
        ADM["👤 Admin"]
    end

    subgraph Frontend["Frontend (React + TypeScript)"]
        LOGIN_UI["Login Page"]
        DASH_UI["Dashboard Page"]
        FORM_UI["PSF Request Form"]
        HISTORY_UI["History / Audit Page"]
        ADMIN_UI["Admin Panel"]
    end

    subgraph Nginx["Reverse Proxy (Nginx)"]
        PROXY["/api/* → Backend"]
    end

    subgraph Backend["Backend API Service (NestJS)"]
        AUTH["Auth Module"]
        REQ_MOD["Requests Module"]
        AUDIT_MOD["Audit Module"]
        EXPORT_MOD["Export Module"]
        ADMIN_MOD["Admin Module"]
    end

    subgraph Database["PostgreSQL"]
        USERS_TBL[("users")]
        FORM_DEF[("form_definitions")]
        PSF_REQ[("psf_requests")]
        SEARCH_IDX[("psf_request_search_index")]
        AUDIT_LOG[("psf_request_audit_logs")]
        FIELD_MAP[("field_mappings")]
        CANON_VAL[("canonical_submission_values")]
        AUTOFILL[("autofill_rules")]
        EXPORT_P[("export_profiles")]
    end

    %% Actor → Frontend
    REQ --> LOGIN_UI & DASH_UI & FORM_UI & HISTORY_UI
    SFO --> LOGIN_UI & DASH_UI & FORM_UI & HISTORY_UI
    ADM --> LOGIN_UI & DASH_UI & ADMIN_UI

    %% Frontend → Nginx → Backend
    LOGIN_UI --> PROXY
    DASH_UI --> PROXY
    FORM_UI --> PROXY
    HISTORY_UI --> PROXY
    ADMIN_UI --> PROXY

    PROXY --> AUTH
    PROXY --> REQ_MOD
    PROXY --> AUDIT_MOD
    PROXY --> EXPORT_MOD
    PROXY --> ADMIN_MOD

    %% Backend → Database
    AUTH --> USERS_TBL
    REQ_MOD --> PSF_REQ & SEARCH_IDX & CANON_VAL & FIELD_MAP & AUTOFILL
    AUDIT_MOD --> AUDIT_LOG
    EXPORT_MOD --> SEARCH_IDX & PSF_REQ & EXPORT_P
    ADMIN_MOD --> FORM_DEF & AUTOFILL & EXPORT_P & USERS_TBL
```

---

## 2. Request Lifecycle State Machine

Shows all valid status transitions, including optional statuses.

```mermaid
stateDiagram-v2
    [*] --> Draft : Requester creates request

    Draft --> Submitted : Requester submits
    Draft --> Cancelled : Requester cancels

    Submitted --> SetupInProgress : Setup Owner picks up
    Submitted --> NeedMoreInformation : Setup Owner requests info
    Submitted --> Rejected : Setup Owner / Admin rejects
    Submitted --> Cancelled : Admin cancels

    NeedMoreInformation --> Submitted : Requester re-submits

    SetupInProgress --> PSFCreated : Setup Owner completes PSF info
    SetupInProgress --> NeedMoreInformation : Setup Owner requests info

    PSFCreated --> Completed : Setup Owner / Admin marks done

    Rejected --> [*]
    Cancelled --> [*]
    Completed --> [*]

    state Draft {
        [*] --> Editing
        Editing --> Saved : Auto-save / Manual save
        Saved --> Editing : Re-open
    }
```

---

## 3. Sequence Diagrams

### 3.1 Login Flow

Local authentication using HttpOnly Secure Cookie (ADR-0006).

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant Nginx as Nginx
    participant BE as Backend API
    participant DB as PostgreSQL

    User ->> FE: Enter username & password
    FE ->> Nginx: POST /api/auth/login
    Nginx ->> BE: Forward request

    BE ->> DB: SELECT user WHERE username = ?
    DB -->> BE: User record (hashed password)
    BE ->> BE: Bcrypt.compare(password, hash)

    alt Valid credentials
        BE ->> BE: Create session
        BE -->> Nginx: 200 OK + Set-Cookie (HttpOnly, Secure)
        Nginx -->> FE: Forward response
        FE ->> Nginx: GET /api/me (with cookie)
        Nginx ->> BE: Forward request
        BE ->> DB: Lookup session + user role
        DB -->> BE: User profile & role
        BE -->> Nginx: { id, username, role }
        Nginx -->> FE: User profile
        FE ->> FE: Render pages based on role
    else Invalid credentials
        BE -->> Nginx: 401 Unauthorized
        Nginx -->> FE: Error response
        FE ->> User: Show error message
    end
```

### 3.2 Create & Submit PSF Request

Covers form load, draft save, submission, and write-time canonical extraction.

```mermaid
sequenceDiagram
    actor Requester
    participant FE as Frontend
    participant BE as Backend API
    participant DB as PostgreSQL
    participant Email as Email Service

    Requester ->> FE: Click "New Request"
    FE ->> BE: GET /api/admin/form-config
    BE ->> DB: SELECT active form_definitions
    DB -->> BE: Schema JSON (latest published)
    BE -->> FE: Form schema

    FE ->> FE: Render dynamic form from schema

    Requester ->> FE: Fill in Requester Information (selects Product Type)
    FE ->> BE: POST /api/requests (status = Draft)
    BE ->> DB: INSERT psf_requests (requester_data_json)
    BE ->> DB: INSERT psf_request_audit_logs (CREATE_REQUEST)
    DB -->> BE: OK
    BE -->> FE: { requestId, requestNo, status: "Draft" }

    Note over Requester, DB: Requester can save & edit multiple times while Draft

    Requester ->> FE: Click "Submit"
    FE ->> BE: POST /api/requests/{id}/submit

    BE ->> BE: Validate required fields against schema
    BE ->> DB: UPDATE psf_requests SET status = 'Submitted'
    BE ->> DB: Store schema_snapshot_json

    rect rgb(230, 245, 255)
        Note over BE, DB: Write-time canonical extraction
        BE ->> DB: SELECT field_mappings WHERE form_key & version
        DB -->> BE: Canonical key mappings
        BE ->> DB: UPSERT canonical_submission_values
        BE ->> DB: UPSERT psf_request_search_index
    end

    BE ->> DB: INSERT psf_request_audit_logs (CHANGE_STATUS)
    BE ->> Email: Send notification (Subject: New Request Assigned) to all Setup Owners
    Email -->> BE: OK
    BE -->> FE: { status: "Submitted" }
    FE ->> Requester: Show success notification
```

### 3.3 Setup Owner Completes PSF Created Information

Shows the full flow of the Setup Owner picking up, editing, and marking a request as PSF Created.

```mermaid
sequenceDiagram
    actor SetupOwner as Setup Owner
    participant FE as Frontend
    participant BE as Backend API
    participant DB as PostgreSQL
    participant Email as Email Service

    SetupOwner ->> FE: Open Dashboard (filtered: pending)
    FE ->> BE: GET /api/requests?status=Submitted
    BE ->> DB: SELECT FROM psf_request_search_index WHERE status = 'Submitted'
    DB -->> BE: Matched requests
    BE -->> FE: Request list
    FE ->> SetupOwner: Display request list

    SetupOwner ->> FE: Open request detail
    FE ->> BE: GET /api/requests/{id}
    BE ->> DB: SELECT psf_requests + schema_snapshot
    DB -->> BE: Full request data
    BE -->> FE: Request data + schema

    FE ->> FE: Render Requester Info (read-only) + PSF Created Info (editable)

    SetupOwner ->> FE: Click "Start Setup"
    FE ->> BE: POST /api/requests/{id}/start-setup
    BE ->> DB: UPDATE status = 'Setup In Progress', setup_owner = username, setup_owner_role = role
    BE ->> DB: INSERT audit_log (CHANGE_STATUS)
    BE -->> FE: OK

    SetupOwner ->> FE: Fill PSF Created Information fields
    FE ->> BE: PUT /api/requests/{id}/psf-created
    BE ->> DB: UPDATE psf_created_data_json
    BE ->> DB: INSERT audit_log (UPDATE_FIELD, per changed key)
    BE -->> FE: OK

    SetupOwner ->> FE: Click "Mark as PSF Created"
    FE ->> BE: POST /api/requests/{id}/mark-psf-created
    BE ->> BE: Validate required PSF Created fields

    rect rgb(255, 245, 230)
        Note over BE, DB: Write-time canonical extraction for PSF Created fields
        BE ->> DB: UPSERT canonical_submission_values
        BE ->> DB: UPSERT psf_request_search_index
    end

    BE ->> DB: UPDATE status = 'PSF Created', psf_created_at = NOW()
    BE ->> DB: INSERT audit_log (MARK_PSF_CREATED)
    BE ->> Email: Send notification (Subject: Status Updated to PSF Created) to Requester & all Setup Owners
    Email -->> BE: OK
    BE -->> FE: { status: "PSF Created" }

    Note over FE: Requester can now see PSF Created Information (read-only)
    Note over Requester, SetupOwner: Any user (all roles) can manually change the status via the Status Dropdown at any stage, triggering status update in DB and email notifications.
```

### 3.4 Auto-fill Flow

Shows how auto-fill triggers, resolves conflicts via most-recent-match, and lets the user accept or edit values.

```mermaid
sequenceDiagram
    actor Requester
    participant FE as Frontend
    participant BE as Backend API
    participant DB as PostgreSQL

    Requester ->> FE: Type value in trigger field (e.g. Reference PSF = "PSF-001")
    FE ->> FE: Debounce input (300ms)
    FE ->> BE: GET /api/autofill?formKey=psf-request-form&field=reference_psf_name&value=PSF-001

    BE ->> DB: SELECT autofill_rules WHERE trigger_canonical_key = 'reference_psf_name'
    DB -->> BE: Rule with fill_targets_json

    BE ->> DB: SELECT canonical_submission_values<br/>WHERE canonical_key = 'reference_psf_name'<br/>AND value = 'PSF-001'<br/>JOIN psf_requests ON completed_at IS NOT NULL<br/>ORDER BY completed_at DESC LIMIT 1
    DB -->> BE: Most recent completed match (REQ-0004)

    BE ->> DB: SELECT target canonical values for REQ-0004
    DB -->> BE: { probecard_name, product, wafer_fab, ... }

    BE -->> FE: { matched: true, sourceRequestId: "REQ-0004", suggestedValues: {...} }

    FE ->> FE: Populate target fields with suggested values
    FE ->> FE: Show "Auto-filled" badge per field
    FE ->> FE: Show source: "Auto-filled from REQ-0004 (latest completed)"

    alt User accepts auto-filled values
        Requester ->> FE: Continue editing other fields
    else User edits an auto-filled field
        Requester ->> FE: Modify auto-filled value
        FE ->> FE: Replace badge with "Edited by user"
    end
```

### 3.5 Excel Export Flow

Covers both sync streaming (<2,000 records) and async background job (≥2,000 records) paths, with role-based cell masking.

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend API
    participant DB as PostgreSQL

    User ->> FE: Set export filters (status, date range)
    FE ->> BE: GET /api/requests/export.xlsx?status=PSF_CREATED&from=2026-06-01&to=2026-06-30

    BE ->> DB: SELECT COUNT(*) FROM psf_request_search_index WHERE filters
    DB -->> BE: Record count

    alt Record count < 2,000 (Synchronous Streaming)
        BE ->> DB: SELECT export_profiles WHERE form_key (column config)
        DB -->> BE: Admin-configured column order

        BE ->> DB: SELECT form_definitions (latest active schema)
        DB -->> BE: Active schema + canonical keys

        BE ->> DB: DECLARE CURSOR for filtered psf_requests + canonical values
        loop Stream rows
            DB -->> BE: Batch of rows
            BE ->> BE: Map canonical keys → columns
            BE ->> BE: Apply cell masking (if Requester role)
            BE ->> BE: Format dates to Asia/Bangkok TZ
            BE -->> FE: Stream .xlsx chunks
        end
        FE ->> User: Browser downloads psf_requests_20260610_143000.xlsx

    else Record count >= 2,000 (Asynchronous Background Job)
        BE -->> FE: 202 Accepted { jobId, message: "Export is being prepared..." }
        FE ->> User: Show "Export in progress" notification

        BE ->> BE: Start background job
        BE ->> DB: Stream + build .xlsx file
        BE ->> BE: Save to temp storage

        Note over BE: Job completes
        BE -->> FE: Notify (via polling or WebSocket)
        FE ->> User: Show "Download Ready" with link
        User ->> FE: Click download
        FE ->> BE: GET /api/exports/{jobId}/download
        BE -->> FE: File stream
        FE ->> User: Download file
    end
```

### 3.6 Admin: Publish New Form Version

Shows the workflow for editing a form schema and publishing a new version.

```mermaid
sequenceDiagram
    actor Admin
    participant FE as Admin Panel
    participant BE as Backend API
    participant DB as PostgreSQL

    Admin ->> FE: Open Form Configuration
    FE ->> BE: GET /api/admin/form-config
    BE ->> DB: SELECT form_definitions (latest version)
    DB -->> BE: Current schema JSON
    BE -->> FE: Schema + version info

    FE ->> FE: Render JSON Schema Editor (Monaco) + Live Preview

    Admin ->> FE: Edit schema (add/rename/remove fields)
    FE ->> FE: Live preview updates in real-time
    FE ->> FE: Client-side schema validation

    Admin ->> FE: Click "Save Draft"
    FE ->> BE: PUT /api/admin/form-config
    BE ->> DB: UPSERT form_definitions (status = 'draft', version + 1)
    BE -->> FE: { version: N+1, status: "draft" }

    Admin ->> FE: Click "Publish"
    FE ->> BE: POST /api/admin/form-config/publish

    BE ->> DB: UPDATE form_definitions SET status = 'published', published_at = NOW()

    rect rgb(230, 255, 230)
        Note over BE, DB: Update canonical field mappings
        BE ->> DB: INSERT field_mappings for new/changed fields
        Note over BE: Maps new fieldKeys → canonical keys
    end

    BE -->> FE: { version: N+1, status: "published" }
    FE ->> Admin: Show success: "Form v(N+1) published"

    Note over FE: New requests will use the new schema.<br/>Existing submitted requests keep their schema snapshot.
```

---

## 4. Database ER Diagram

Complete entity-relationship diagram for all tables.

```mermaid
erDiagram
    form_definitions {
        UUID id PK
        TEXT form_key
        INT version
        TEXT title
        TEXT description
        JSONB schema_json
        TEXT status
        TEXT created_by
        TIMESTAMP created_at
        TIMESTAMP published_at
    }

    psf_requests {
        UUID id PK
        TEXT request_no UK
        TEXT form_key FK
        INT form_version
        TEXT status
        TEXT requester
        TEXT setup_owner
        TEXT setup_owner_role
        TEXT product_type
        JSONB requester_data_json
        JSONB psf_created_data_json
        JSONB schema_snapshot_json
        TIMESTAMP created_at
        TIMESTAMP updated_at
        TIMESTAMP submitted_at
        TIMESTAMP psf_created_at
        TIMESTAMP completed_at
    }

    field_mappings {
        UUID id PK
        TEXT form_key
        INT form_version
        TEXT field_key
        TEXT canonical_key
    }

    canonical_submission_values {
        UUID id PK
        UUID request_id FK
        TEXT canonical_key
        TEXT value
        TIMESTAMP updated_at
    }

    psf_request_search_index {
        UUID request_id PK
        TEXT request_no
        TEXT title
        TEXT reference_psf_name
        TEXT psf_setup_file_name
        TEXT probecard_name
        TEXT product
        TEXT wafer_fab
        TEXT status
        TEXT priority
        TEXT requester
        TEXT setup_owner
        TEXT setup_owner_role
        TEXT product_type
        TIMESTAMP request_date
        TIMESTAMP due_date
        TIMESTAMP updated_at
    }

    psf_request_audit_logs {
        UUID id PK
        UUID request_id FK
        TEXT action_type
        TEXT field_key
        TEXT field_label
        TEXT old_value
        TEXT new_value
        TEXT changed_by
        TEXT changed_by_role
        TIMESTAMP changed_at
        TEXT reason
        JSONB metadata_json
    }

    autofill_rules {
        UUID id PK
        TEXT form_key
        TEXT trigger_canonical_key
        TEXT lookup_source
        JSONB fill_targets_json
        TEXT status
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    export_profiles {
        UUID id PK
        TEXT form_key
        TEXT profile_name
        JSONB columns_json
        BOOLEAN is_default
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    %% Relationships
    form_definitions ||--o{ psf_requests : "defines schema for"
    form_definitions ||--o{ field_mappings : "has field mappings"
    psf_requests ||--|| psf_request_search_index : "indexed by"
    psf_requests ||--o{ canonical_submission_values : "has canonical values"
    psf_requests ||--o{ psf_request_audit_logs : "has audit trail"
    field_mappings }o--o{ canonical_submission_values : "maps fields to"
    form_definitions ||--o{ autofill_rules : "has autofill rules"
    form_definitions ||--o{ export_profiles : "has export profiles"
```

---

## 5. Backend Module Dependency

Shows how NestJS modules depend on each other.

```mermaid
flowchart TB
    APP["AppModule"]

    AUTH["AuthModule"]
    REQ["RequestsModule"]
    AUDIT["AuditModule"]
    EXPORT["ExportModule"]
    ADMIN["AdminModule"]
    DB["DatabaseModule"]

    APP --> AUTH
    APP --> REQ
    APP --> AUDIT
    APP --> EXPORT
    APP --> ADMIN
    APP --> DB

    AUTH --> DB
    REQ --> DB
    REQ --> AUDIT
    AUDIT --> DB
    EXPORT --> DB
    EXPORT --> REQ
    ADMIN --> DB

    subgraph RequestsModule
        REQ_CTRL["RequestsController"]
        REQ_SVC["RequestsService"]
        SEARCH_SVC["SearchIndexService"]
        AUTOFILL_SVC["AutofillService"]

        REQ_CTRL --> REQ_SVC
        REQ_SVC --> SEARCH_SVC
        REQ_SVC --> AUTOFILL_SVC
    end

    subgraph AuditModule
        AUDIT_SVC["AuditLogService"]
    end

    subgraph ExportModule
        EXP_CTRL["ExportController"]
        EXP_SVC["ExcelExportService"]

        EXP_CTRL --> EXP_SVC
    end

    subgraph AdminModule
        ADM_CTRL["AdminController"]
        FORM_SVC["FormSchemaService"]

        ADM_CTRL --> FORM_SVC
    end

    REQ_SVC --> AUDIT_SVC
```

---

## Legend

| Symbol | Meaning |
|---|---|
| `👤` | Human actor |
| `──>>` | Synchronous request |
| `-->>` | Response |
| `rect` | Highlighted operation block |
| `PK` | Primary Key |
| `FK` | Foreign Key |
| `UK` | Unique Key |

---

> **Note**: These diagrams are designed to be rendered by any Mermaid-compatible viewer. For the best experience, view in GitHub, GitLab, or VS Code with a Mermaid extension.
