# Industrial Operations Frontend Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans after the combined design and implementation plan is approved. Checkboxes track execution; none authorizes execution by itself.

**Status:** Completed on 3 October 2026 after user approval. Implementation followed the verified routing policy and written specification; existing business/API contracts remain authoritative. See the [fidelity and verification ledger](2026-10-03-frontend-fidelity-ledger.md) for evidence and limits.

**Goal:** Apply the approved Direction C design to the complete PSF frontend so engineering operations are easy to scan, edit, and review while retaining every existing business contract.

**Architecture:** Keep the current React screen components, state helpers, API client, routes, and server authority. Establish a small shared presentation vocabulary and the application shell first, then update screens in exclusive file groups. The root integrator owns global styling and combines the shared form work with request workflows.

**Tech stack:** Existing React 19, TypeScript, TanStack Router, Vite, Vitest, native HTML controls/dialog, and lucide-react. No new UI, state, form, or styling dependency.

**Spec:** [Frontend design specification](2026-10-03-frontend-design-spec.md). Read the approved version alongside this plan before execution.

**Worker routing:** Independent effort control was verified from live session records. Root stays on `gpt-6.1-sol / ultra`; Form (`/root/form`), Schema (`/root/schema`), and Admin (`/root/admin`) use `gpt-6.1-sol / high`. Verify effective settings before editing work and after any resume or replacement. Previous audit workers inherited Ultra and must not be reused for implementation. Max/Ultra integration, architecture, conflict resolution, and final review stay with root. See [routing verification and evidence](2026-10-03-agent-routing-verification.md) for controls, limits, and exceptional escalation policy.

## Global constraints

- Main background #ffffff; canvas #f7f9fb; sidebar #f4f6f8; primary text #172b3a; muted text #536676; border #d9e1e7; input border #7a8d99.
- Primary action #007e9e, hover #00677f, selected background #e8f5f8, selected text #00677f (5.81:1). Input border #7a8d99 (3.44:1 against white). Lime #a8c83a is limited to a small brand accent.
- Semantic success #18724b, warning #916008, error #b42332. State is also expressed through text; color is never the only signal.
- Preserve the theme toggle. Dark canvas #101820, surface #17232d, navigation #131e27, text #eaf1f5, secondary text #aabbc7, border #344550, input border #607584, primary/link #58c5dc, primary text #101820, selection #203b47, success #80cba6, warning #edc278, error #f2a3ae.
- Inter/system typography with no font dependency; h1 24/32 px at weight 600, h2 16/24 px at weight 600, body/controls 14/20 px at weight 400 (actions 500), labels 12/18 px at weight 500, technical codes 12/18 px at weight 400.
- Spacing scale 4/8/12/16/24/32 px; gutters 24 px desktop and 16 px mobile; form row gap 16 px, label gap 6 px; control radius 4 px, dialog radius 6 px; controls 36 px on desktop and at least 44 px for touch.
- Flat surfaces have no shadow; dialogs/temporary menus may have one subtle shadow. Multi-line table rows target 48–56 px. Focus outline is 2 px dark cyan with 2 px offset; verify AA text contrast and 3:1 control/focus boundaries where applicable.
- Desktop sidebar 216 px; application header 52 px. Narrow layouts use an accessible navigation drawer and a reading order that puts actions above long forms.
- Use compact count strips, open form sections, strong request identity/status/owner metadata, real links, and tables that scroll locally without clipping content.
- Preserve the official frontend/src/assets/NXP.png asset if retained; do not redraw it. Product type/department use secondary text, Normal priority stays plain, and outline Lucide icons use 16 px with stroke width 1.75–2.
- Preserve API endpoints, payload fields, revision tokens, filtering scope, pagination semantics, permissions, validation rules, schema snapshots, autofill rules, visibility release, and export behavior.
- Do not add uploads, new master-data CRUD, workflow states, role capabilities, or backend behavior.
- Source services, domain/state helpers, backend files, and generated routeTree.gen.ts are frozen. navigationState.ts is an explicit shell exception: presentation labels and grouping may change; its role matrix must not.
- Existing unrelated working-tree edits remain intact. Do not start the backend against the configured database. Use browser fixtures; isolated integration is optional only when an existing safe environment is available.
- This is one combined review proposal. There are no further user approval gates between implementation stages once this plan and its spec are approved.

## Review focus

1. Long labels, custom schema fields, and long identifiers must wrap without changing field keys, order, or available controls. Pin this in form renderer coverage and desktop/mobile visual checks.
2. Delayed autofill responses must continue to preserve manual edits and existing values. Re-run the existing autofill interaction and state tests after form presentation changes.
3. Concurrent saves and 409 responses must preserve local edits, retain revision checks, and show recovery actions without submitting twice. Exercise existing requester/PSF/export conflict tests.
4. Role/session changes and PSF visibility release must use current server flags, suppress unauthorized actions, and avoid displaying stale sensitive data. Exercise shell and workflow fixtures across requester, setup owner, and admin.
5. Mobile dialogs, keyboard focus, browser zoom, and narrow table/form layouts must remain operable. Add meaningful dialog/guard coverage and verify keyboard access at mobile widths and 200% zoom.

## File ownership and frozen interfaces

All paths below are relative to the repository root. Owners may change only their listed files. New tests belong to the owner of the source under test. Agents request CSS changes from the root integrator; they never edit global styles.

| Owner | Exclusive source files |
| --- | --- |
| Root integrator | frontend/src/index.css; all new frontend/src/styles/*; all new frontend/src/components/ui/*; frontend/src/components/AppShell.tsx; frontend/src/components/NavSidebar.tsx; frontend/src/components/navigationState.ts; frontend/index.html; the entire frontend/src/components/RequestsWorkspace.tsx; frontend/src/routes/requests/index.tsx; frontend/src/routes/requests/new.tsx; frontend/src/routes/requests/$requestId/index.tsx; frontend/src/routes/requests/$requestId/history.tsx; frontend/src/routes/my-drafts.tsx; frontend/src/routes/dashboard/index.tsx; frontend/src/routes/admin/index.tsx; frontend/src/routes/admin/master-data.tsx. |
| Form agent | frontend/src/components/DynamicFormRenderer.tsx; frontend/src/components/ActiveSchemaForm.tsx. No activeSchemaFormState.ts, API, or validation helper edits. |
| Schema agent | frontend/src/components/AdminFormConfigPage.tsx; frontend/src/components/AdminFormConfigEditor.tsx. No adminFormConfigState.ts edits. |
| Admin agent | frontend/src/components/AdminUserManagementPage.tsx; frontend/src/components/AdminWorkflowTransitionPage.tsx; frontend/src/components/AdminAutofillRulesPage.tsx; frontend/src/components/GlobalHistoryPage.tsx; frontend/src/components/RequestExportPage.tsx; frontend/src/routes/login/-LoginPage.tsx; frontend/src/routes/login/-DevelopmentLogin.tsx; frontend/src/routes/login/-development-login.css. No associated state/service helper edits. |

Root test ownership: AppShell.test.tsx, NavSidebar.test.tsx, RequestsWorkspace.test.tsx, DashboardPage.test.tsx, new ui tests, and new placeholder-route tests.

Form test ownership: DynamicFormRenderer.test.tsx, ActiveSchemaForm.test.tsx, ActiveSchemaForm.interaction.test.tsx, and ActiveSchemaForm.autofill.interaction.test.tsx.

Schema test ownership: AdminFormConfigPage.test.tsx, AdminFormConfigPage.interaction.test.tsx, and AdminFormConfigEditor.test.tsx.

Admin test ownership: existing test and interaction/async test files corresponding to its screens, plus the two login tests. Existing helper tests may be run but not edited.

The root produces and freezes these shared interfaces before parallel screen editing:

    PageHeader({
      title: string,
      description?: ReactNode,
      actions?: ReactNode
    }): ReactElement

    AsyncNotice({
      kind: 'loading' | 'empty' | 'error' | 'success' | 'info',
      title: string,
      children?: ReactNode,
      action?: ReactNode
    }): ReactElement

    StatusLabel({
      status: string,
      kind?: WorkflowStatusKind | 'neutral',
      compact?: boolean
    }): ReactElement

    ConfirmDialog({
      open: boolean,
      title: string,
      description?: ReactNode,
      confirmLabel: string,
      cancelLabel?: string,
      pending?: boolean,
      tone?: 'default' | 'danger',
      onConfirm: () => void,
      onCancel: () => void
    }): ReactElement

Create these in frontend/src/components/ui/PageHeader.tsx, AsyncNotice.tsx, StatusLabel.tsx, and ConfirmDialog.tsx. Reuse WorkflowStatusKind from frontend/src/services/api.ts unchanged: draft/open/completed/cancelled. StatusLabel does not parse its label to infer semantics. Use catalog kinds with FileText/CircleDot/CircleCheck/CircleX respectively; missing or unknown kinds use neutral icon/text. Preserve API kind cancelled and administrator-facing type label Cancel. For schema lifecycle presentation only, explicitly map active to completed, draft to draft, and published/inactive to neutral while preserving the exact displayed lifecycle label and API value.

Native field/button CSS names are ui-field, ui-label, ui-control, ui-help, ui-error, ui-button, ui-button--primary, ui-button--secondary, ui-button--ghost, and ui-button--danger. Use existing markup where it already supplies accessible labels and descriptions. Keep the public prop surface above fixed during screen work.

## Dependencies and execution order

Preparation → shell/primitives/style freeze → three parallel screen streams → root request integration and placeholder treatment → integrated QA.

The form, schema, and admin agents may start together only after the root freezes the shell, shared components, CSS vocabulary, and tokens. The root may update dashboard/list structure during those streams, but detail/create integration waits for the form agent. If a shared change is needed, the root publishes it once and tells each affected owner; agents do not duplicate primitives or invent local style tokens.

### Task 1: Establish the baseline and comparison set

**Owner:** Root. **Files:** Existing frontend tests and approved design artifacts; no business source changes.

- [x] Inspect current working-tree changes and record the protected boundaries and approved spec revision.
- [x] Run npm test, npm run lint, and npm run build from frontend. Record pre-existing failures separately from redesign regressions.
- [x] Capture the available desktop/mobile fixtures for dashboard, request browser/draft browser, create/detail, form list/editor, users, workflow, autofill, audit, export, and login.
- [x] Maintain the root-owned concept index docs/design/concepts/README.md: queue.png maps to request browsing/dashboard vocabulary, detail.png to request detail, create.png to creation, admin.png to Form Management, and mobile.png to mobile detail. Record image dimensions, the spec's precedence, and any focused references added later.
- [x] Inspect existing concept images with view_image. For other screens use the approved spec and established system, adding a focused concept before editing only when needed to resolve a layout question. Do not assume a concept exists for every screen.
- [x] Confirm fixture isolation and the browser-access method. No configured-database backend start is part of this task.

**Deliverable:** Baseline evidence and a screen comparison set. Existing failures and unavailable integration environments are explicit.

### Task 2: Build and freeze the shell and presentation primitives

**Owner:** Root. **Files:** Root shell/style/ui ownership above; associated shell and ui tests.

- [x] Define the exact design tokens and native-control vocabulary in index.css or root-owned styles; replace conflicting global declarations with one authoritative rule per primitive.
- [x] Implement PageHeader, AsyncNotice, and StatusLabel with the fixed interfaces. Loading/success/info use suitable status announcements; errors use alerts without repeatedly announcing an entire screen.
- [x] Implement ConfirmDialog with native dialog semantics, labelled title/description, initial focus, Escape/cancel handling, pending-state protection, and focus restoration to its trigger.
- [x] Update AppShell/NavSidebar to the 216 px sidebar/52 px header, compact identity controls, role-visible navigation, breadcrumb context, and mobile drawer behavior.
- [x] Keep the existing contextual New Request action in the actual header, including administration screens where authorized, and omit it on creation. A compact concept cannot remove reachable working actions; record those retained actions as fidelity extensions.
- [x] Give the below-900 px drawer an accessible name, close control, Escape/backdrop dismissal, focus handling/return, and route-selection close behavior; retain desktop collapse. Add a skip link and aria-current on active navigation.
- [x] Preserve session refresh/logout/redirect logic and existing form-version breadcrumbs. Preserve the theme toggle, implement the specified dark tokens, and give pages meaningful document titles with resolved request identity on detail.
- [x] Add meaningful tests for dialog cancellation/confirmation and restored focus, mobile navigation close behavior, and retained role-specific links. Re-run AppShell and NavSidebar tests.
- [x] Compare desktop/mobile shell renders and the queue/mobile references with view_image; freeze the interfaces/styles for delegated screen work.

**Deliverable:** Stable shell, primitives, and styling contract. This is a technical dependency checkpoint, not another user approval request.

### Task 3: Update the schema-driven requester and PSF form presentation

**Owner:** Form agent. **Files:** Form ownership above.

**Consumes:** Frozen primitives, CSS vocabulary, unchanged schema/state/API helpers.

- [x] Make Product Type a clear choice group and preserve every schema section as an open, named section with readable spacing.
- [x] Use semantic field grouping and widths without hardcoding field removal or changing administrator-defined field order, keys, options, required flags, or values.
- [x] Use the compact two-column desktop/one-column mobile form grid, full-width multiline fields, and required asterisks with one explanation. Add no defaults or fabricated selectors; preserve text types supplied by the schema.
- [x] Give radio groups an accessible group name and preserve label/error/status associations. Ensure IDs remain unique when requester and PSF forms coexist.
- [x] Present editable/read-only state, save feedback, autofill provenance, and schema-upgrade notices using the shared vocabulary.
- [x] Keep draft save permissive, submission validation server-controlled, and Upgrade/Remain/Reload behavior intact. Retain mutation locks, dirty callbacks, submission conflict settlement, and local-edit rebasing.
- [x] Exercise custom/long-label schemas, delayed autofill/manual edits, older/inconsistent schemas, read-only flags, and 409 recovery through existing meaningful tests.
- [x] Compare desktop/mobile form renders with the applicable create/detail references using view_image, then return requested CSS adjustments to the root and document the unchanged integration props.

**Verification:** From frontend, run npm test -- src/components/DynamicFormRenderer.test.tsx src/components/ActiveSchemaForm.test.tsx src/components/ActiveSchemaForm.interaction.test.tsx src/components/ActiveSchemaForm.autofill.interaction.test.tsx src/components/activeSchemaFormState.autofill.test.ts. All affected tests must pass.

**Deliverable:** Updated form markup with the existing ActiveSchemaForm and DynamicFormRenderer integration contracts.

### Task 4: Integrate dashboard, request browsers, create, and detail

**Owner:** Root. **Files:** RequestsWorkspace.tsx, request/dashboard/draft route bindings and root workflow tests.

**Dependency:** Task 2; detail/create completion also requires Task 3.

- [x] Replace dashboard cards with a compact counts strip that retains the existing selected work-state filters and Setup Owner relationship filter.
- [x] Reorganize list title/actions/search/status/product-type controls, show useful result range/empty/error feedback, and retain query scope, limit, offset, and server status catalog.
- [x] Provide real request links, keyboard-visible focus, semantic table headers, and locally scrollable tables. Avoid introducing sorting/bulk actions without existing contracts.
- [x] Give create the explanation “Save a draft first. Review and submit from request detail.” and a restrained private-draft/autofill help rail; mobile help becomes optional details after essential form content. Retain successful-save navigation to detail and explain server-controlled requester identity.
- [x] Strengthen detail identity, current status, requester/owner/due metadata and revision context; move the Action center above forms in mobile reading order.
- [x] Display requester/PSF dirty state near the relevant save action and the existing reason a status action is disabled. Keep the two save endpoints and all status/revision gates separate.
- [x] Use ConfirmDialog for presentation changes to exit/discard confirmations where the existing router blocker supports the same semantics; retain before-unload protection and test cancel/stay versus confirm/leave.
- [x] Exercise requester, setup-owner, admin, hidden/released PSF data, empty allowed-status lists, saving locks and preserved values after 409 responses.
- [x] Compare dashboard/browser to queue.png, create to create.png, and detail to detail.png/mobile.png using view_image on references and renders; record system-based extensions where no exact concept view exists.

**Verification:** From frontend, run npm test -- src/components/RequestsWorkspace.test.tsx src/components/DashboardPage.test.tsx src/components/ActiveSchemaForm.interaction.test.tsx. Tests must confirm the unchanged calls/payloads and guarded transitions.

**Deliverable:** Complete request workflow presentation integrated with the shared form changes.

### Task 5: Update form management list and editor

**Owner:** Schema agent. **Files:** Schema ownership above.

**Dependency:** Task 2; run in parallel with Tasks 3 and 6.

- [x] Rework family selection, version table, active/draft/inactive context, and duplicate/publish actions using real links and the shared status vocabulary.
- [x] Make the field/section editor a readable open hierarchy with clear option controls and a locally scrollable preview.
- [x] Preserve parsing, validation, ordering, duplicate-version behavior, version routes, breadcrumb context, dirty protection, publication requirements, and conflict refresh.
- [x] Use the shared confirmation UI where needed without bypassing existing save/discard/publish conditions.
- [x] Verify long section/field/option labels, both form families, custom schemas, unsaved navigation, and publish conflicts.
- [x] Compare the list with admin.png using view_image; inspect editor/mobile renders against the spec and shared system, using a focused concept if needed, and pass CSS requests to the root.

**Verification:** From frontend, run npm test -- src/components/AdminFormConfigPage.test.tsx src/components/AdminFormConfigPage.interaction.test.tsx src/components/AdminFormConfigEditor.test.tsx. All affected tests must pass.

**Deliverable:** Consistent version management and schema editing with unchanged schema contracts.

### Task 6: Update remaining administration, audit, export, and authentication

**Owner:** Admin agent. **Files:** Admin ownership above.

**Dependency:** Task 2; each screen is an independently reviewable unit.

- [x] Update Users & Roles table/editor while preserving supported roles/departments, read-only identity/email, changed-value/department validation, busy locks, native-dialog focus/cancel behavior, current-user profile refresh, and partial-success errors when the user update succeeds but session refresh fails. Add no user revision-token contract.
- [x] Update the actual status catalog controls: exact names/kinds, protected Draft, create/rename/delete, current request counts, request-replacement choice when deleting, and visibility-trigger settings/replacement. Preserve optional request replacement for an unused status, required replacement for a used status, nullable trigger replacement, opaque expectedUpdatedAt tokens, busy locks, and existing 409 refresh/recovery. Add no directed transition matrix, transition-permission editor, or required-PSF-field configuration UI.
- [x] Update autofill rule list/editor with clear source/target relationships, preserving canonical keys, rule ordering and validation.
- [x] Update global audit filters/results, keeping Apply/Clear boundaries, current request links, explicit UTC filter labels, a local display-timezone label, action/metadata rows and server query behavior. Add no server pagination or hidden PSF values.
- [x] Update export filters/preview/job progress/errors/download actions, retaining queued-job polling/cancellation, scope, and existing filenames/download behavior.
- [x] Update LDAP login and the existing development-login surface using the same visual system, retaining redirect/session/error semantics and development-only visibility.
- [x] Inspect each screen's desktop/mobile render with view_image against the approved spec and established shell/control system; compare a focused concept if one was needed and indexed. Return CSS requests to the root.
- [x] Run each screen's existing unit and interaction/async tests after its edits; add tests only for changed behavior that cannot be verified by visual review.

**Verification:** From frontend, run npm test -- src/components/AdminUserManagementPage.test.tsx src/components/AdminUserManagementPage.interaction.test.tsx src/components/AdminWorkflowTransitionPage.test.tsx src/components/AdminWorkflowTransitionPage.interaction.test.tsx src/components/AdminAutofillRulesPage.test.tsx src/components/AdminAutofillRulesPage.interaction.test.tsx src/components/GlobalHistoryPage.test.tsx src/components/RequestExportPage.test.tsx src/components/RequestExportPage.async.test.tsx src/routes/login/-LoginPage.test.tsx src/routes/login/-DevelopmentLogin.test.tsx. All affected tests must pass.

**Deliverable:** Consistent working admin/audit/export/authentication screens. Live LDAP success is not claimed from fixtures.

### Task 7: Replace structural placeholders with honest existing capability

**Owner:** Root. **Files:** routes/admin/index.tsx, routes/admin/master-data.tsx, routes/requests/$requestId/history.tsx, and root-owned route tests.

- [x] Make /admin a compact directory of existing working tools, using existing role-visible destinations.
- [x] Make /admin/master-data an explicit “Not configured” information state with navigation to working administration tools. Add no form, simulated records, save action, or new CRUD endpoint.
- [x] Implement the existing request-history route using api.fetchPsfRequestHistory and the currently exported RequestHistoryPanel from frontend/src/components/RequestsWorkspace.tsx (entries: PsfRequestHistoryEntry[], error: string | null, loading: boolean). Keep root ownership of that module; no undefined history helper is assumed. Show request context, loading/empty/error/retry and a real back link, and retain API masking of PSF events.
- [x] Verify these routes render useful states, history reads the existing endpoint, and the directory links only to working destinations.
- [x] Inspect the resulting desktop/mobile states with view_image against the approved spec and design vocabulary.

**Deliverable:** No structural-placeholder copy remains in reachable routes; available capability is represented accurately.

### Task 8: Integrate and verify the complete frontend

**Owner:** Root, with read-only reviews from the other owners. **Files:** Integration fixes only within their established ownership.

- [x] Review the combined diff for frozen-file changes, duplicate styles, lost props/handlers, misleading affordances, and changed payload/permission assumptions.
- [x] Run npm test, npm run lint, and npm run build from frontend. Passing commands are recorded with their exit results; baseline failures remain labelled.
- [x] Inspect every major screen's render using view_image at 1440×900, 1536×1024 native concept size where applicable, 390×844, and an intermediate tablet/200% zoom case. Inspect available concept images with view_image alongside renders; other screens use the approved spec/system or an indexed focused concept. Verify both themes, long identifiers, open forms, table scrolling/cues, dialogs, focus order, AA contrast, and reduced motion.
- [x] Maintain root-owned docs/design/2026-10-03-frontend-fidelity-ledger.md with screenshot paths and at least five concrete comparison points per major screen, copy differences, and intentional contract-preserving extensions/deviations. Concepts remain references, never runtime UI assets.
- [x] Exercise meaningful browser flows with fixtures: filter/open request; create/save/reopen draft; preserve manual edits during autofill; save requester and PSF data separately; cancel/confirm discard; schema upgrade/remain/reload; status submission; role/visibility changes; version editing/publishing; admin edits; audit navigation; export job retry/download; login errors/redirect.
- [x] Confirm loading, empty, error, success and relevant disabled states appear consistently and do not replace preserved unsaved values.
- [x] Use isolated integration only if an existing safe environment is available. Do not start the configured-database backend to obtain screenshots or proof.
- [x] Report the delivered changes, command/browser evidence, remaining limitations, and any explicit gaps against the approved spec.

**Acceptance:** All scoped screens follow Direction C, existing tests/lint/build pass apart from identified baseline issues, meaningful fixture flows succeed, and the business/source boundaries remain intact. Completion evidence distinguishes fixture validation from live integration.

## Verification limits and handoff

Real LDAP authentication, configured-database behavior, and production export persistence remain unproved unless the existing safe environment supplies direct evidence. This limitation does not prevent frontend fixture, component, accessibility, build, and visual verification.

Execution is complete in the existing feature checkout. Final verification passed 300 tests, lint and production build. Browser fixtures, visual comparisons, keyboard and responsive checks are recorded in the fidelity ledger. No safe live integration environment was available; the configured backend remained stopped. No commits, backend changes or deployment were performed.
