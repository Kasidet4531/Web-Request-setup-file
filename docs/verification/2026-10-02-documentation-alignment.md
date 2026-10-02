# Documentation alignment — 2026-10-02

Scope: documentation only in `unified-local-auth`, starting at application
commit `01eab7b`. The user requested alignment of all Markdown with source while
preserving the original branches. No application code, configuration, dependency
or database change is part of this documentation commit.

## Approach

- Audit current backend/frontend source, controllers, package scripts and startup
  behavior. Tie maintained behavior claims to source links.
- Replace template/outdated entry-point READMEs with current setup information.
- Add a maintained current-implementation guide and complete documentation index.
- Replace current diagrams with source-backed logical flows, preserving the old
  target diagrams in `docs/history/diagrams-target-architecture.md`.
- Add historical notices to original specs, backlog snapshots, plans and ADRs.
  Preserve their original target/decision bodies and prior verification outcomes.
- Update domain wording, agent/tracker scope, mock removal and remote database
  setup. Keep credentials outside Markdown/version control.
- Separate the later successful read-only `pg.Pool` connection check from the
  original mocked-database auth verification. It is not live feature acceptance.

The [documentation index](../README.md) inventories the files and their scope.

## Validation scope

Validation checks local Markdown paths/heading anchors, fenced-block balance,
documentation-only diff scope, preserved historical bodies and unchanged original
branches. Behavioral statements receive source review. Application test counts
remain the dated results in the [auth verification](2026-10-02-unified-local-auth.md);
they are not represented as rerun by this documentation audit.

No external links or current GitHub issue/label state are verified by local link
checks. No database queries, application startup, migrations, live browser testing
or deployment are performed during this documentation task. A clean documentation
diff does not guarantee that a later merge will have no conflicts.

## Completed local checks

- All 38 Markdown files are represented in the documentation index: 34 existing
  documents plus the new index, current guide, historical diagrams and audit record.
- Local Markdown paths and heading anchors resolve; no `file://` links or
  unmatched fenced-code blocks remain. External URLs were not checked.
- The 22 delegated historical records and ADR 0014 preserve their original
  bodies after the inserted status notices. Archived diagrams preserve their
  body with only the heading/status and relocated ADR links adjusted.
- Git diff/status contains only `.md` changes; `git diff --check` passes.
- `rapid-frontend-rewrite` remains clean at `8c11bb4`; `local-test-auth` remains
  clean at `9d0eaf1`.
- Independent source review checked current behavior and found one correction:
  installed Vite preview inherits `server.proxy` when `preview.proxy` is unset.
  The frontend README was corrected; independent production hosting is separate.

The preview behavior was confirmed in installed Vite's `resolvePreviewOptions`
implementation, which uses `proxy: preview?.proxy ?? server.proxy`. The dependency
is installed locally from the lockfile; this does not establish a production proxy.
Mermaid flows were checked against source and fenced syntax; a visual Mermaid
renderer was not run during this audit.
