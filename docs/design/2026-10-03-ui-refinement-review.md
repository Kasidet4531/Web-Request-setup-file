# UI/UX refinement review — 3 October 2026

Implemented on the existing `unified-local-auth` branch. No branches, worktrees,
commits, backend changes, dependencies, API changes, or business-record edits were
introduced. The existing engineering-operations direction remains the design
authority in `2026-10-03-frontend-design-spec.md`.

## Design decisions and ownership

The lead inspected the product, architecture, working tree, and real connected
UI before selecting scope. The UI/UX Pro Max specialist identified queue
orientation, state clarity, and request-identity risks. Taste implemented
typography, density, responsive status sizing, count controls, and administration
discovery. Impeccable independently reviewed fresh desktop/mobile/dark captures
and drove the mobile status-width and placeholder-contrast corrections. A
separate code reviewer found no P0/P1/P2 regressions in this turn's deltas.

Specialist and review workers were explicitly configured as GPT-6.1 Sol / High.
Product intent was sufficiently established by the source and existing design
documents; no branding or workflow assumption required user clarification.

## Changes

- Queue titles and operational values use a clearer 14px hierarchy; technical
  identifiers and secondary metadata remain 12px. Long catalog status names wrap
  verbatim in a column with a 220px minimum. Tables scroll locally, including at
  the tablet breakpoint, where the scroll cue is now visible.
- Compact dashboard counts have clearer active, numeric, and hover treatment.
  Their controls stay in place during updates while unavailable totals show `—`.
- Keyword and product searches commit after 300ms. Pagination resets when text
  commits, while status/work-state/relation changes remain immediate.
- Last successful rows remain visible and inert during refresh; updating status
  is announced and stale counts are suppressed. Scope changes, changed actors,
  errors, and older responses cannot expose prior results as current data.
- Empty states explain submitted, related, private-draft, and filtered scopes;
  filtered empty states offer a working Clear filters action. Result ranges and
  pagination share one footer. Product-type search has an honest empty placeholder.
- Request detail is scoped to the current request ID and the route remounts its
  detail state when that ID changes. Previous forms and actions stay hidden while
  a new identity loads or access is denied.
- Status controls explain unchanged selection, draft submission, and unavailable
  choices while retaining existing dirty/schema blocking reasons. Creation
  explains that the signed-in name supplies requester identity when saving.
- Administration links include accurate tool purposes and directional chevrons,
  with existing role visibility unchanged.
- Placeholder text uses the existing secondary-text token at full opacity.
  Browser-computed contrast is 5.95:1 in light mode and 8.09:1 in dark mode.

Preserved: route/query contracts, native controls and dialogs, real request
links, row keyboard behavior, configurable statuses, draft privacy, captured
schema versions, independent saves, release visibility, unsaved-change guards,
official login branding, and the previously requested removal of the Create
help rail and My drafts export shortcut.

## Verification

Fresh frontend checks pass: **321 tests in 31 files**, ESLint, TypeScript/Vite
production build, and `git diff --check`. New behavior regressions were observed
failing before their fixes. The pre-existing history retry test now returns a
matching request ID for its second-request fixture; its assertions remain intact.

Playwright inspected the running frontend and backend without route interception:

- Fourteen screens at 1440×900, 900×900, and 390×844: dashboard, submitted requests,
  drafts, creation, detail, request history, administration, users, forms,
  statuses, autofill, export, global history, and unavailable master data.
- Four additional 720px reflow checks and three desktop dark-theme checks.
  These 49 screen/viewport/theme observations had no body horizontal overflow,
  unexpected alert, or observed runtime/console error.
- With 450ms real network latency, rapid typing issued one settled keyword
  query. All 100 prior rows remained visible and inert while updating; stale
  footer counts were absent, and the matching query resolved to one row.
- One filtered empty state had a working clear action. Enter on the actual
  request link navigated to detail. Canceling unsaved navigation retained form
  input, and explicit discard left the form without saving a record.
- Mobile navigation dismissed with Escape and restored opener focus; choosing
  a route closed the drawer. Horizontal table scrolling reached the last column.
- Browser history navigation between two request identities under network latency
  hid previous metadata/actions during loading and resolved the correct identity.
- At 900px, the locally overflowing table displayed its scroll cue without body
  overflow. Theme placeholder contrast was measured from computed browser styles.

Live captures are intentionally outside the repository:
`/tmp/psf-redesign-after-*.png`. Temporary inspection scripts and browser logs
also remain outside source changes. Authentication state was retained only in
the browser; no cookie/token export was produced.

## Preservation and verification limits

Before editing, 147 pre-existing changed/untracked files were preserved under
`/tmp/psf-ui-redesign-baseline`. Comparison found no missing baseline files and
only four intentionally refined files changed: `RequestsWorkspace.tsx`, its
tests, `index.css`, and `AdministrationDirectory.tsx`. The new status-guidance
test and this review are the only additional source/document artifacts.

Browser verification used the connected development Admin session and existing
database demo records. It did not exercise company LDAP, live record saving or
submission, schema publication, or workbook generation. Existing automated
coverage for those frontend behaviors passed. Impeccable's manual rendered
review completed; its optional detector engine was unavailable during the
initial review. This review does not claim a complete accessibility certification.

Subsequent hook recovery verification confirmed that engine `0.1.5` is available
in the launcher's existing version-pinned cache. Its SHA-256 matched the pinned
Darwin ARM64 release checksum. The normal sandbox can run `engine-probe`,
`hooks status`, and `detect frontend/src/index.css --json` successfully; the
targeted CSS scan returned no findings with the documented Inter exception.

Seven isolated fixture checks verified detector controls, immediate
`PostToolUse` findings, deferred `Stop` findings, deduplication, and clean results
after fixture repair. Both handlers completed within their configured timeouts.
A temporary CSS fixture edited through Codex's actual `apply_patch` tool also
received the native Impeccable `PostToolUse` acknowledgment, then was deleted.
The `Stop` handler was exercised directly with documented event payloads; native
Stop delivery was previously observed in this chat. Verification results are
saved at `/tmp/psf-hook-verification-results.json`.

Recovery retains the existing plugin registration, sandbox, and hook trust
settings. No duplicate project hook manifest or broad detector suppression was
added. The sole exception remains `overused-font=inter`. If a future plugin
version needs a new engine, bootstrap it once through the installed launcher's
checksum-verified downloader with approval scoped to that setup command, then
resume ordinary sandboxed execution.
