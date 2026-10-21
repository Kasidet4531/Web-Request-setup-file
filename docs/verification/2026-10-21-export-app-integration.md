# Excel export application integration

Worktree: `export/correctness-100k`, based on `ad564fac1b443462662d87c6d0c43ee5f8b74d0e`. The feature stays on this separate branch. No merge, push or deployment is part of this work.

## Application changes

- `SearchIndexService` reads each export and its active schemas through one `REPEATABLE READ READ ONLY` transaction. A materialized CTE selects each filtered, ordered page before lateral canonical-value aggregation. Within the snapshot, the window count runs on the first page only; the controller retains its existing preflight count. Complete stored schemas are decoded and interned by exact JSON content within that export.
- `FormSchemaService.getActiveSchema` accepts an optional query runner so the export headers share the request snapshot. Other callers retain the existing default connection and behavior.
- `ExcelExportService` sends pages of at most 500 records to a dedicated worker and waits for each acknowledgment. Formatting and workbook creation run in that worker. The database snapshot commits after the pages have been read, before the final workbook rendering. Missing pages or worker failures reject the export; workers terminate on success, failure and application shutdown.
- The new `export-workbook.ts` uses ExcelJS's streaming writer, shared strings and compression level 1. It retains the original serialization, field precedence, active-then-historical column union and PSF visibility logic. It bridges ExcelJS's `StreamBuf` to the installed archiver version and escapes carriage-return bytes before ZIP compression, preserving CRLF and UTF-8 text.

Complete stored snapshots remain the source of historical field mappings. Form key/version equality never substitutes a published schema for a captured snapshot. Choice lists do not filter stored export values. This integration uses ExcelJS rather than a custom XLSX/ZIP writer; the earlier quoted 0.55–0.85 second result is not a measurement of this implementation.

The controller, authorization rules, job repository, queue processor, frontend and default `EXPORT_SYNC_THRESHOLD=2000` are unchanged. The previously rejected Setup Owner-to-Requester guard is absent. Existing Requester masking and existing job ownership rules remain the baseline behavior.

## Verification method

The acceptance runner starts its own disposable PostgreSQL instance with synthetic data only. It builds the backend, loads the compiled application classes, starts real Nest HTTP export routes and invokes the real service, worker, queue repository and processor. Only the authenticated session/profile is supplied by a test fixture. Driver instrumentation records snapshot/page/count operations and can commit independent concurrent writes; it does not replace application query or rendering methods.

Every downloaded file is checked against the independent fixture oracle through a ZIP/SAX reader that preserves streaming UTF-8. Headers, row membership/order, values, number/string types, blanks and CRLF are checked. Validation runs after the timed batch. The fixture has 76 output columns, 29 choice columns with unlisted values including `6`/`200`, unequal old/new columns, Requester and PSF v1–v3, and same-version snapshots with different field keys. Admin, Requester and Setup Owner are each exercised.

Both response paths are tested. Direct-response tests override the sync threshold to the fixture size; queued tests use the production threshold of 2,000 for 5,570/100,000 requests and the unchanged 1-second processor timer. The test client polls at 100 ms; the frontend's existing 2-second polling interval is outside this measurement. Timings include HTTP download and, for queued jobs, actual BYTEA persistence and retrieval. They exclude browser rendering, real authentication and network latency outside the local machine.

While exports run, a separate HTTP endpoint performs `SELECT 1` through the same pool every 100 ms. This probes API responsiveness under export load; it does not benchmark every other business endpoint. Node RSS includes all worker threads and is the cumulative peak within that server cohort, not per-file memory. The environment has a two-core CPU quota and 8 GiB memory limit. The database uses disposable disk storage under the output directory. A guard stops only the test server if Node RSS exceeds 6 GiB or anonymous/tmpfs/kernel cgroup memory exceeds 7.3 GiB. Large direct concurrency is bounded to two files; smaller fixtures also test four.

The mutation cases commit all six changes after the first page: reorder, delete, insert, change canonical values, change PSF values/release, and rename active schema headers. Independent predicates confirm those changes exist outside the snapshot. The downloaded file must still match the initial snapshot.

## Results

The initial 780-request HTTP smoke run passed 19 files and 1,127,764 logical cells with zero differences, including four simultaneous submissions and all six concurrent mutations.

The complete disk-backed application run passed **30 files and 91,645,360 logical cells**, with zero value/type/CRLF differences. All 18 normal batches and both snapshot-mutation cases passed. Each normal export used exactly one window count and 12 pages (5,570 requests) or 200 pages (100,000 requests), all within a committed read snapshot. All six mutation predicates passed at both sizes. No guard stopped the final run and no OOM kill occurred.

| Requests/file | Path  | Submitted together | Median/file (s) | Last file (s) | Health p95 max across samples (ms) | Health max (ms) | Node cohort peak (MiB) |
| ------------: | ----- | -----------------: | --------------: | ------------: | ---------------------------------: | --------------: | ---------------------: |
|         5,570 | sync  |                  1 |            2.12 |          2.13 |                               16.9 |            30.0 |                  672.5 |
|         5,570 | sync  |                  2 |            2.86 |          2.95 |                               45.8 |           106.6 |                  963.3 |
|         5,570 | sync  |                  4 |            5.38 |          5.51 |                              112.0 |           192.2 |                 1516.6 |
|         5,570 | queue |                  1 |            2.31 |          3.27 |                               20.0 |            35.1 |                  685.9 |
|         5,570 | queue |                  2 |            3.97 |          5.42 |                               12.7 |            21.0 |                  685.9 |
|         5,570 | queue |                  4 |            7.23 |         11.87 |                                8.8 |            21.0 |                  688.7 |
|       100,000 | sync  |                  1 |           40.39 |         42.73 |                               15.4 |           103.9 |                 2390.6 |
|       100,000 | sync  |                  2 |           56.04 |         56.85 |                               40.0 |           129.5 |                 3822.5 |
|       100,000 | queue |                  1 |           43.22 |         43.32 |                               20.0 |           105.9 |                 2396.5 |
|       100,000 | queue |                  2 |           64.39 |         85.39 |                               16.1 |           100.8 |                 2517.1 |

Level 1 aggregates the three individual actor samples; levels 2/4 are one mixed-role batch each. These are exploratory samples, not stable latency percentiles or a production capacity guarantee. The p95 column is the largest batch-specific health p95, not a combined percentile. Peak RSS is cumulative within a server cohort. The queue retains one active export: two large submissions complete after approximately 43 and 85 seconds.

For 100,000 requests, two direct exports raise median latency from about 40.4 to 56.0 seconds (about 1.39×), with a 3.73 GiB observed server/worker RSS peak. Under the unchanged production threshold these large requests use the queue, whose observed cohort peak was about 2.46 GiB. All HTTP health probes succeeded; across the complete normal matrix their maximum latency was 192.2 ms.

Final backend regression: **46 suites / 723 tests passed**. Build, ESLint and Prettier pass. Added worker-error, early-exit and invalid-result tests reject failures without returning a partial workbook. A separate read-only review found no mandatory correctness fixes.

- [Application results, per-file correctness, snapshot metrics and source hashes](2026-10-21-export-app-results.json).
- [Initial 780-request HTTP smoke results](2026-10-21-export-app-smoke.json).
- [Normal ExcelJS document-reader agreement](2026-10-21-export-app-readers.json): all 1,270,188 cells in three downloaded 5,570-request files agree with the independent reader.
- [Service-level concurrency CLI compatibility](2026-10-21-export-app-concurrency-cli.json): four batches / six files at 780 requests pass with the integrated application service. The existing scale CLI also passes its three-role 780-request probe.

An earlier attempt stored the database under `/tmp`, which is tmpfs in this environment. About 2.6 GiB of database files therefore consumed RAM. The memory guard stopped the two-file 100,000-request direct batch near the environment limit; no OOM kill occurred. The three preceding large files had passed, but the interrupted batch is not counted as acceptance. The fixture database was moved to disk and the complete matrix rerun. [Memory control evidence](2026-10-21-export-app-memory-control.json).

## Reproduce

From `backend`, with dependencies installed and local PostgreSQL startup permitted:

```bash
npm run test:export:app -- --sizes=780 --output-dir=../.cache/export-app-integration/smoke
npm run test:export:app -- --sizes=5570,100000 --output-dir=../.cache/export-app-integration/verified
npm test -- --runInBand
```

The service-level scale/concurrency runners also use the application implementation. Their `application` mode replaces the earlier reflection-based prototype. The legacy `--candidate-only` flag remains accepted by the scale CLI, which now runs the application only. Historical JSON reports remain readable by the cross-reader command.

These checks establish behavior for generated fixtures. They do not certify every real stored request or constitute a manual Microsoft Excel open. Production latency and resource use depend on real data, deployment hardware and workload.
