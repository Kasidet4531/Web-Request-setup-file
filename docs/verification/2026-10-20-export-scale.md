# Synthetic Excel export: 5,570 and 100,000 requests

> Historical prototype results. The application has since been integrated on the isolated branch; see [application integration and HTTP verification](2026-10-21-export-app-integration.md). The scale/concurrency CLIs now exercise the application implementation; old mode labels remain readable in these archived JSON reports.

The fixture has since been expanded to cover every data choice column, unequal columns and Requester/PSF v1–v3: [latest choice/version verification](2026-10-20-export-choice-version.md). The measurements and fixture descriptions below retain the earlier runs as historical evidence.

**The repaired candidate passes the exact cell-correctness tests:** 5,570 and 100,000 requests for Admin, Setup Owner and Requester, with `diffs = 0` in all six cases. Each export was interrupted by committed inserts, deletes, reordering, canonical/PSF changes and active-schema changes from a separate PostgreSQL connection. Output still matches the independent fixture oracle at the initial database snapshot. The earlier diagnostic findings are retained below as historical evidence.

The performance candidate remains a test-only prototype; the application export service, SQL service, threshold, queue processor, controller and frontend are unchanged. This work preserves the existing authorization rules and adds no role-demotion restriction. Nothing has been deployed or merged.

Worktree: `export/correctness-100k`, based on `ad564fac1b443462662d87c6d0c43ee5f8b74d0e`.

## Role coverage follow-up

The first scale matrix covered two data-visibility branches using Admin and Requester. It omitted explicit Setup Owner execution. The runner now defaults to all three `UserRole` values and allows `--roles=setup_owner` to add the missing cases without repeating successful large runs.

For fresh exports, all three roles receive the same non-Draft requests matching the export filters and the same columns. The current export query does not restrict Requesters to their own requests or Setup Owners to their department. This describes export behavior only, not permissions throughout the application.

| Role                   | PSF without `psfReleasedAt` | PSF with `psfReleasedAt` |
| ---------------------- | --------------------------- | ------------------------ |
| Admin                  | Included                    | Included                 |
| Setup Owner (GNTC/MFG) | Included                    | Included                 |
| Requester              | Blank                       | Included                 |

Release visibility depends on `psfReleasedAt`, not just the status label. Existing job access additionally requires the same account; Admin-created jobs retain their existing Admin-only role requirement.

| Requests | Added actor | Cells checked | Differences | Matches Admin value/type digest | Export seconds |
| -------: | ----------- | ------------: | ----------: | ------------------------------- | -------------: |
|    5,570 | Setup Owner |       423,396 |           0 | Yes                             |           1.69 |
|  100,000 | Setup Owner |     7,600,076 |           0 | Yes                             |          39.96 |

Both added cases confirm all six concurrent writes outside the consistent snapshot. Together with the four earlier cases, this checks **24,070,416 logical cells** across all three roles. The normal ExcelJS document reader independently agrees with all 423,396 cells in the 5,570 Setup Owner file. GNTC/MFG receive separate queued-lifecycle tests; department is not an input to the scale export service's visibility decision.

The GNTC/MFG lifecycle tests verify that a Setup Owner export contains unreleased PSF and the owner can check status and download the file. Per the user's scope clarification, the additional Setup Owner-to-Requester restriction was removed and the controller restored to its original behavior. This task does not introduce a new authorization policy. Foreign-owner denial and Requester-created job masking now explicitly cover Setup Owner as well, documenting existing behavior.

- [Setup Owner scale results](2026-10-20-export-correctness-setup-owner.json).
- [Setup Owner document-reader agreement](2026-10-20-export-correctness-setup-owner-readers.json).
- Earlier role-coverage backend regression: **45 suites, 708 tests passed**. The current full regression after restoring the controller is recorded in the latest choice/version verification.

Reproduce only the added role from `backend`:

```bash
npm run test:export:scale -- --candidate-only --roles=setup_owner --output-dir=../.cache/export-correctness-setup-owner
node --require ts-node/register scripts/verify-export-scale.ts --cross-read=../.cache/export-correctness-setup-owner/report.json --document-only
```

## Correctness follow-up

The first test deliberately required zero duplicate rows from the original candidate and failed with `1 !== 0`. Its independent cell checks also recorded 66/54 CRLF differences on the 30-row Admin/Requester fixtures. These failures were observed before implementing the repairs.

Repairs in the test candidate:

1. Use one connection and `REPEATABLE READ READ ONLY` for the initial count, every request/canonical page and active schema reads. Active schemas are now fetched from the fixture database through the same connection. Output represents one consistent point in time.
2. Before compression, preserve carriage returns in worksheet XML as `&#13;`. The transform operates on the ASCII CR byte and never decodes UTF-8 chunks; ExcelJS continues to generate and escape the rest of the document.
3. After the first page, a separate connection commits six changes: move an old request to the front, delete another, insert a replacement, change a canonical title, change PSF data/release, and rename active schema headers. Six independent SQL predicates verify those changes are visible outside the read snapshot. The fixture is restored between actor cases.

The original cell oracle was not relaxed. It now observes zero CRLF differences as well as zero other differences. Deleted-at-runtime requests remain present at their initial snapshot values; new-at-runtime requests are excluded. The total remains the exact original set with its original ordering and field types.

| Requests | Actor     | Cells checked | Differences | All six concurrent writes confirmed | Export seconds |
| -------: | --------- | ------------: | ----------: | ----------------------------------- | -------------: |
|    5,570 | Admin     |       423,396 |           0 | Yes                                 |           1.60 |
|    5,570 | Requester |       423,396 |           0 | Yes                                 |           1.83 |
|  100,000 | Admin     |     7,600,076 |           0 | Yes                                 |          40.73 |
|  100,000 | Requester |     7,600,076 |           0 | Yes                                 |          41.09 |

This checks **16,046,944 logical cells** across the four files, including headers. The full run exits 0 and records `strictCellAcceptancePassed: true`. A separate update-between-pages probe retains the current-mode failure as a control (one duplicate), while the repaired candidate has zero duplicates. Exact-text and consistent-snapshot tests therefore have demonstrated failing and passing executions.

ExcelJS's normal document reader also opens both repaired 5,570 files and agrees with every cell of the independent reader, including CRLF and the long Thai description. The known ExcelJS streaming-reader UTF-8 defect is not used to decide export correctness. This follow-up does not claim to fix that external reader.

- [Final exact-correctness results](2026-10-20-export-correctness-results.json).
- [Small failing-control/passing-candidate probes](2026-10-20-export-correctness-smoke.json).
- [Normal ExcelJS reader agreement](2026-10-20-export-correctness-readers.json).
- Full backend regression: **45 suites, 704 tests passed** with local listening enabled. ESLint, Prettier and targeted TypeScript checks also pass.

Reproduce the repaired candidate without repeating the already-bounded 100k current-mode timeout:

```bash
npm run test:export:scale -- --candidate-only --output-dir=../.cache/export-correctness-final
node --require ts-node/register scripts/verify-export-scale.ts --cross-read=../.cache/export-correctness-final/report.json --document-only
```

The corrected files are in `.cache/export-correctness-final/`. The following sections describe the **initial diagnostic run before these repairs**; its output files and machine results are retained for comparison.

## Fixture and scope

- The supplied tab-separated mapping is retained in [export-columns.tsv](../../backend/test/fixtures/export-columns.tsv), SHA-256 `3356f03f3ecd5397edea348fcf4e6387a699413ef05d6d99948e52ea71874761`.
- There are 73 source columns, rather than assuming the earlier report's 67-column layout. Status becomes a metadata column; Request No, Request Date and Updated At add three more columns: 76 output columns total.
- The seven shaded historical fields are Allow to probe on crack pad, the four Edge die count directions, FPC, and Notch Direction for Probe. Empty `For` alone is not a historical marker. White system fields, including Remark and Workflow Name, remain in the current synthetic schema. This models the user's clarified layout; it is not a change to the application's import script or a certification of its current database schemas.
- Requester v1 includes historical fields; v2 uses the current fields and renamed labels. Another captured v2 has the same form identity/version and different field keys, so a version-only cache/substitution is deliberately unsafe. Creator snapshots span two versions. Fields span three sections.
- Inputs include Thai, emoji, XML-sensitive characters, LF/CRLF, tabs, a 32,767-character Thai description, leading-zero 26-digit text identifiers, literal formula-looking text, numeric-looking choices, zero/negative/decimal number fields, unparseable legacy numeric text, null/empty values, arrays and unsupported legacy objects.
- Fixture expectations follow the existing canonical serialization contract: outside whitespace is trimmed, string arrays are joined, unsupported objects become blank, valid number fields become numbers, and form dates remain text. This is not a claim that the application exports every raw JSON value unchanged.
- Stored canonical values override raw requester data in selected rows; one fifth of requests have no canonical projection and exercise snapshot-based extraction. PSF release is independent of status, exercising released/unreleased cells for both actors.
- The 100,000 submitted requests have 3,946,669 canonical entries. Another 37 Drafts sort ahead of them and must be excluded. Exactly 100,000 data rows are expected, not 100,037.

The fixture, expected rows and schema construction are in [export-scale.ts](../../backend/test/fixtures/export-scale.ts). The runner is [verify-export-scale.ts](../../backend/scripts/verify-export-scale.ts).

## What ran

Both modes use the real `ExcelExportService` and `SearchIndexService`, real PostgreSQL queries, and the application's row mapping and visibility logic. Active schema responses are supplied by the synthetic fixture. A new temporary PostgreSQL cluster contains only generated data and is stopped/deleted after each run. No `.env`, configured database, or real request data is loaded.

`current` uses the existing 500-row queries, window counts, snapshot reads, lateral canonical aggregation and ExcelJS document writer in a fresh worker.

`candidate` changes only the test instance:

1. Count once and materialize each filtered, ordered page before canonical aggregation.
2. Still fetch complete stored snapshots. Intern only identical full JSON content within one export, never a version match alone.
3. Reuse application row construction, then write with ExcelJS's streaming writer, inline strings and native compression level 1. Yield between row batches.
4. Bridge ExcelJS `StreamBuf` to Node `PassThrough` inside the test instance: the installed archiver-utils 5 override expects `pipe()` to return its destination, while ExcelJS 4.4's `StreamBuf.pipe()` returns undefined. This adapter is experimental compatibility code, not a production dependency fix.

The candidate does not implement the custom XML/ZIP writer proposed earlier. It still accumulates request objects and rows; it is not a complete database-to-file streaming architecture. Its writer runs in an isolated test child process, so this experiment does not certify application event-loop responsiveness.

## Measurements

One sequential run per combination; these are not medians or p95 results. Node v24.19.0, ExcelJS 4.4.0, local PostgreSQL 18.4, AMD EPYC 9V74, 8 GiB environment limit. Each case has a 3 GiB V8 old-space limit, 5,000 MiB process RSS guard and 240-second deadline. PostgreSQL version, locality, fixture and output width differ from the user's earlier measurements.

Export time includes service data retrieval, row construction, rendering and the returned buffer. It excludes oracle validation, browser/HTTP transfer, authentication, job polling, and queue storage. RSS is the test process peak, including any worker threads and verification; it excludes the fixture database and runner parent.

| Submitted requests | Mode      | Actor     |   Export seconds |   Peak RSS MiB |     File MiB |
| -----------------: | --------- | --------- | ---------------: | -------------: | -----------: |
|              5,570 | Current   | Admin     |             5.49 |        1,093.5 |         1.73 |
|              5,570 | Current   | Requester |             6.07 |        1,085.7 |         1.69 |
|              5,570 | Candidate | Admin     |             1.62 |          297.3 |         2.54 |
|              5,570 | Candidate | Requester |             1.64 |          299.5 |         2.48 |
|            100,000 | Current   | Admin     | Stopped at 240 s | 919.4 observed | Not produced |
|            100,000 | Candidate | Admin     |            38.44 |        1,612.5 |        46.34 |
|            100,000 | Candidate | Requester |            39.69 |        1,524.5 |        45.13 |

The current 100k run timed out during retrieval. It did not reach workbook rendering; this run establishes neither a complete 100k baseline comparison nor an out-of-memory failure. The second 100k current-role run was omitted after that bounded failure. The candidate's two 100k files were instead compared in full against the independent fixture oracle.

## Cell correctness and findings

The primary reader independently unzips the workbook and uses strict SAX XML parsing with Node's streaming UTF-8 decoder. It checks sheet identity, sequential rows, cell references, shared/inline strings, numeric values, headers, every logical cell, and absence of formula nodes. Omitted cells and explicit empty strings are equivalent logical blanks; nonblank types must match exactly. Mutation checks reject numeric/text changes, missing nonblank values and private values in masked cells.

| Requests | Mode      | Actor     | Cells checked, including header | CRLF-to-LF differences | Other differences |
| -------: | --------- | --------- | ------------------------------: | ---------------------: | ----------------: |
|    5,570 | Current   | Admin     |                         423,396 |                 11,987 |                 0 |
|    5,570 | Current   | Requester |                         423,396 |                  9,880 |                 0 |
|    5,570 | Candidate | Admin     |                         423,396 |                 11,987 |                 0 |
|    5,570 | Candidate | Requester |                         423,396 |                  9,880 |                 0 |
|  100,000 | Candidate | Admin     |                       7,600,076 |                215,172 |                 0 |
|  100,000 | Candidate | Requester |                       7,600,076 |                177,409 |                 0 |

At 5,570 the current and candidate logical hashes also match for each actor. Historical and captured-version values, column ordering, text identifiers, number types and PSF masking matched the oracle in all completed cases. This is bounded evidence for this fixture, not a universal correctness guarantee.

1. **CRLF is a real strict difference.** ExcelJS writes literal carriage returns into XML, whose parsing normalizes CRLF to LF. Normalizing away this difference in the validator would hide it. It is counted above; `strictPass` is false. Both forms still display a line break, but exact character preservation is not established.
2. **OFFSET does not provide a consistent read snapshot.** In a rollback-only 30-row probe, fetch the first 10 rows, move the oldest request to the front by updating `updated_at`, then fetch offset 10. Both modes duplicate one request in those first 20 rows. A production change needs a defined consistent database snapshot across requests, canonical data and schemas; faster queries or keyset pagination alone do not establish point-in-time consistency.
3. **Version equality is insufficient.** The captured-v2 counterexample produces different canonical values if replaced with the active-v2 definition. Full snapshot content must remain authoritative unless equality/immutability is independently guaranteed.
4. **ExcelJS streaming reader is unsuitable as the sole oracle here.** Its UTF-8 decoder decodes chunks independently without retaining partial characters. On the same valid 100k XML, it introduces replacement characters in 105 Admin cells and 64 Requester cells. The primary reader finds the original Thai content intact. ExcelJS's document reader opens both 5,570 candidate files and matches all primary-reader cells, including the long Thai value. These secondary-reader failures are recorded, not counted as exporter differences or described as a successful cross-check.

There was no native Excel/LibreOffice GUI available. This does not certify a manual Excel open without repair, concurrent export load, or changes made while a production export is running. The generated files remain available under `.cache/export-scale/` in this worktree.

## Reproduce and evidence

From `backend`, with dependencies installed and permission to start a local PostgreSQL server:

```bash
npm run test:export:scale
npm run test:export:scale -- --sizes=30 --output-dir=../.cache/export-scale-smoke
node --require ts-node/register scripts/verify-export-scale.ts --cross-read=../.cache/export-scale/report.json
```

The final runner exits **2** for known strict-correctness findings, rather than presenting loss as a green test; unexpected harness errors exit 1. Per-case `success` in the measurements means the export/oracle pipeline completed, while `strictPass` requires zero character differences. The cross-reader command also exits 2 when its readers disagree. A completed diagnostic run is not production acceptance.

- [Measured results](2026-10-20-export-scale-results.json): all six completed export/oracle cases and the bounded 100k baseline timeout.
- [Small probes](2026-10-20-export-scale-smoke.json): four filtered query comparisons, version-substitution counterexample, and both OFFSET reorder failures.
- [Secondary readers](2026-10-20-export-scale-readers.json): full 5,570 document-reader agreement and the two 100k streaming-reader failures.
- Existing export/search regression tests: 8 suites, 79 tests passed, run in this worktree.
- The runner and fixture are checked with ESLint, Prettier and targeted TypeScript compilation.
- Whole-project `tsc --noEmit --incremental false` also reports five existing spec errors in audit, requests controller/service and due-projection tests. The identical errors were reproduced in the unchanged base checkout. They are outside this test-only change.

The consistent-snapshot and exact-text issues identified in this initial run are resolved in the repaired test candidate above. Production adoption still needs a supported streaming integration and separate measurements of sync thresholds and concurrent export capacity. Keep these exact business-value/type/visibility checks as acceptance gates.
