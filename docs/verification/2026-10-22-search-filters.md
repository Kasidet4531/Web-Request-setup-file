# Search and filters — local verification, 22 October 2026

Scope: [the confirmed requirements](../specs/2026-10-22-search-filter-requirements-notes.md),
implemented in the current checkout starting from
`e6dae0331287d18cdc77de1f107ad7405ee08e0a`. No deployment, company LDAP,
configured company database or NAS share was used.

## Behavior checked

- History Search matches Request No., Product Description, actor display name
  or username, without Apply. Action updates immediately. Search pauses 300 ms
  and returns to the first page. Clearing filters restores the unfiltered view.
- A slower earlier response cannot replace a newer result. Invalid date ranges
  show an accessible field error and do not issue a search.
- Bangkok-day boundaries include local midnight and the final millisecond of
  the selected day, excluding both adjacent days. Counts match the same filters.
- Dates stay visible after More filters is collapsed. History has no Status
  filter. Request Snapshot links and the Admin Draft Deletions tab remain.
- Requests and Dashboard offer a legacy Status outside the active catalog,
  even when the matching request is outside the current result page. Legacy
  options do not become allowed Status transitions. Drafts are excluded.
- Selecting a Dashboard Status queries all work states while keeping Team and
  Search. Existing catalog-based summary classifications are preserved.
- The existing Draft privacy and PSF-release regression checks still pass.

## Commands and results

- `npm --prefix frontend test`: **39 files, 536 tests passed**.
- `npm --prefix backend test -- --runInBand`: **49 suites, 744 tests passed**.
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend run build` and `npm --prefix backend run build`: passed.
- Backend ESLint for changed source/unit-test files and the new browser test:
  passed. Backend Prettier applied to the changed TypeScript and browser tests.
- From `backend`, `node --require ts-node/register test/audit-visibility.postgres.test.ts`:
  **10 tests passed** using in-memory PostgreSQL, including the new Search and
  exact Bangkok-day checks.
- From `backend`, `node --require ts-node/register test/search-filters.postgres.test.ts`:
  **1 test passed** using in-memory PostgreSQL and the real lifecycle services.
- From `backend`,
  `EMAIL_E2E_CHROME=/usr/bin/chromium EMAIL_E2E_ARTIFACTS_DIR=../docs/verification/assets/2026-10-22-search-filters node --test test/email-system.search-filters.e2e.mjs`:
  **1 end-to-end test passed**, exercising the built app, real HTTP API and a
  disposable local PostgreSQL database in Chromium. External LDAP/SOAP boundaries
  use the existing offline fixture. Application responses are not mocked.

The Browser plugin exposed no callable browser-control tool in this session,
so browser verification used the repository's Playwright/Chromium fixture.
Loopback server startup required the executor's additional network permission.
The default Playwright browser was absent; the installed `/usr/bin/chromium`
was selected using the fixture's existing `EMAIL_E2E_CHROME` option.

## Visual evidence

Synthetic test records only. Desktop Light/Dark at 1440 px and a 1024 px desktop
layout were inspected. No horizontal page overflow at 1024 px. Mobile design is
outside the project's current scope.

- [History, Light](assets/2026-10-22-search-filters/history-search-light.png)
- [History, Dark](assets/2026-10-22-search-filters/history-search-dark.png)
- [History, 1024 px](assets/2026-10-22-search-filters/history-search-1024.png)
- [Dashboard with a legacy Status](assets/2026-10-22-search-filters/dashboard-legacy-status.png)

## Limits

Search uses case-insensitive partial text matching, not fuzzy matching or
searching all audit metadata. The extra Status choices apply to Requests and
Dashboard filtering; they do not migrate data or rewrite historical Status names.
The configured company environment has not been exercised by these checks.

## Code review

Two independent read-only reviewers inspected the staged implementation against
the pre-implementation baseline above before committing.

### Standards

**0 hard violations, 0 supported smell findings.** Checked the repository
instructions, domain guidance and formatting/lint standards. Debounce cleanup,
coherent result/pagination state, parameterized Search/date SQL, separation of
filter choices from catalog transitions and accessible filter controls were
reviewed. Tool-enforced formatting issues were excluded from this judgment review.

### Spec

**0 findings.** Checked missing/partial behavior, scope additions and incorrect
implementations against the consolidated requirements, including the explicit
removal of History Status filtering. Reviewed automatic Search, Bangkok dates,
pagination, stale responses, legacy Status choices and existing visibility.

Neither reviewer reran the recorded full suites or browser checks. Row/count
reads remain separate SQL commands as before; this change ensures they use the
same filters and visibility, not a new cross-command database snapshot guarantee.

Review summary: Standards **0** findings; Spec **0** findings.

## PR preparation against updated main

Before publication the change was rebased onto `main` at `6cb6bd5` (PR #104).
The only textual conflict was the dated update at the top of
`docs/current-implementation.md`; both feature records were kept. The current
Request Snapshot presentation and the Export changes from main are preserved.

Fresh checks on the rebased tree passed: Frontend **39 files / 547 tests**,
Backend **50 suites / 755 tests**, frontend lint, both builds and the Chromium
end-to-end Search/filter test. The two in-memory PostgreSQL integration files
also passed. The screenshots were refreshed with the built rebased app.

## Follow-up: atomic Audit History columns

Baseline: `89fa669b924929ab65da7c6bccda0202b328303b` (PR #105).
The product owner requested splitting Request into Product Description and
Request No. Each value now occupies its own cell; both can open Request Detail.
Drafts retain their descriptive links and hide internal `DRAFT-…` numbers.
Existing API-generated untitled labels are preserved. No backend contract,
search/filter behavior or Snapshot presentation changed.

Updated existing table assertions first: three failed against the compound
column, then all **23 focused tests** passed after splitting it. Fresh validation:

- Frontend: **39 files / 547 tests**, lint and production build passed.
- Chromium real-app test: **1 passed**, including the six table headers,
  independent description/number cells and navigation through Request No.,
  alongside existing live Search/date/pagination/legacy Status checks.
- Inspected Light/Dark at 1440 px and Dark at 1024 px; no horizontal page overflow.
  The existing local fixture used a disposable database and synthetic records.

Standards review: **0 hard violations, 0 supported smell findings**. Spec review:
**0 remaining findings** after correcting documentation to describe the existing
API-generated untitled labels accurately. The backend suite was not rerun for
this frontend-only behavior change; the earlier **755-test** result above applies
to the same backend source.

- [Atomic columns, Light](assets/2026-10-22-audit-atomic-columns/history-search-light.png)
- [Atomic columns, Dark](assets/2026-10-22-audit-atomic-columns/history-search-dark.png)
- [Atomic columns, 1024 px](assets/2026-10-22-audit-atomic-columns/history-search-1024.png)
