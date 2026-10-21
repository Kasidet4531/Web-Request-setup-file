# Concurrent Excel export: latency, queueing and correctness

> Historical prototype results. The application has since been integrated on the isolated branch; see [application integration and HTTP verification](2026-10-21-export-app-integration.md). The scale/concurrency CLIs now exercise the application implementation; old mode labels remain readable in these archived JSON reports.

This benchmark extends the existing synthetic fixture and performance prototype. All work remains in `export/correctness-100k`; no production exporter, SQL service, authorization rule, queue configuration or frontend is changed.

## Results

**All 22 batches and 48 files passed**, checking **63,383,088 logical cells** with zero value/type/CRLF differences. There were no failed jobs, deadline stops or memory-guard stops. Admin, Requester and Setup Owner account for 18, 16 and 14 verified files respectively.

For actual parallel execution in one Node process:

| Requests per file | Concurrent calls | Median time per file (s) | Slowdown versus one call | Maximum time per file (s) | Observed export Node RSS (MiB) |
| ----------------: | ---------------: | -----------------------: | -----------------------: | ------------------------: | -----------------------------: |
|             5,570 |                1 |                     1.69 |                    1.00× |                      1.69 |                          340.6 |
|             5,570 |                2 |                     2.80 |                    1.66× |                      2.95 |                          441.6 |
|             5,570 |                4 |                     5.76 |                    3.41× |                      5.89 |                          663.7 |
|           100,000 |                1 |                    40.33 |                    1.00× |                     40.33 |                        2,051.8 |
|           100,000 |                2 |                    71.81 |                    1.78× |                     71.82 |                        2,464.2 |

For simultaneous submissions to one real queue processor:

| Requests per file | Submitted together | Median submission-to-ready time (s) | Maximum submission-to-ready time (s) | Median export service time (s) | Observed export Node RSS (MiB) |
| ----------------: | -----------------: | ----------------------------------: | -----------------------------------: | -----------------------------: | -----------------------------: |
|             5,570 |                  1 |                                1.78 |                                 1.82 |                           1.70 |                          310.7 |
|             5,570 |                  2 |                                2.81 |                                 3.81 |                           1.68 |                          366.6 |
|             5,570 |                  4 |                                4.77 |                                 7.82 |                           1.69 |                          423.4 |
|           100,000 |                  1 |                               40.85 |                                40.85 |                          40.00 |                        2,004.8 |
|           100,000 |                  2 |                               63.89 |                                84.88 |                          41.10 |                        2,013.1 |

At 5,570 rows, parallel throughput is 35.6, 42.3 and 41.4 files/minute for levels 1, 2 and 4. Two calls improve throughput by about 19% while increasing per-file latency by 66%. Four calls do not improve throughput over two and consume more memory. With the queue, export service time stays near 1.7 seconds; the increased ready time comes mainly from waiting for preceding jobs and the existing queue timer.

At 100,000 rows, two parallel calls finish in about 71.8 seconds together, versus 40.3 seconds for one call. That is roughly 12% more throughput, while each file takes 78% longer. Two queued jobs become ready after about 42.9 and 84.9 seconds, with only one active export. The single large round cannot establish stable percentiles or worst-case capacity.

The candidate also has an observed event-loop delay maximum of **3.77 seconds** during the two-call 100,000-row batch, versus 0.87 seconds for its single-call batch. This is measured in the test pipeline, whose candidate writer runs in the same Node process. It is evidence of responsiveness pressure; it is not an HTTP health-test result or a measurement of the production worker-based renderer. Production integration still needs a supported worker/streaming design and separate application-level testing.

The real processor retained exactly one active export in every queue batch. This benchmark adds no concurrency setting or limit to the application.

- [Full timings, resources and per-file correctness](2026-10-20-export-concurrency-results.json).
- [780-row smoke test: 14 correct files](2026-10-20-export-concurrency-smoke.json).
- [Wrong-role file rejection control](2026-10-20-export-concurrency-role-control.json): deliberately checking an Admin file as Requester fails the independent oracle, demonstrating sensitivity to mixed-user output.
- Full backend regression: **46 suites, 714 tests passed**. The original scale CLI also passes all three roles on its 30-row compatibility probe. ESLint, Prettier and TypeScript-checked runner startup pass.

## What is measured

Two paths run in a fresh Node process for each batch, sharing one PostgreSQL pool with a maximum of ten connections:

- **Parallel:** submit 1, 2 or 4 calls to the candidate export pipeline in the same Node process. Each call gets its own `REPEATABLE READ READ ONLY` connection and output file. This exercises shared JavaScript execution, native compression, database CPU and memory pressure; it does not assign a separate process to each user.
- **Queue:** concurrently enqueue the same number of jobs into the real `ExportJobRepository`, then run one real `ExportJobProcessor` at its existing 1,000 ms polling interval. This preserves the current one-job-at-a-time behavior. The processor invokes the candidate through a test-only adapter and persists actual workbook bytes in PostgreSQL. Verification reads those persisted bytes back, not only the temporary writer file.

All files use the existing expanded fixture: 76 output columns, 29 choice columns with unlisted values, Requester/PSF v1–v3 with unequal fields, captured same-version field-key differences, canonical/fallback values and role-based PSF content. Admin, Requester and Setup Owner cycle through the jobs. The 5,570-row repeats balance role counts at each concurrency level. The single large round uses Admin for level 1 and Admin/Requester for level 2; it is an exploratory comparison, not a complete role-balanced latency distribution.

The dataset stays fixed during a concurrency batch. The earlier independent tests of committed request/schema changes during a consistent export snapshot remain separate from this load measurement.

## Timing and resource definitions

- Per-job latency starts at submission. Parallel latency includes connection acquisition, all queries, row construction, streaming XLSX generation and local output writes. Queue latency additionally includes enqueueing, queue wait, polling and database storage of the completed file. Queue completion is observed by a test status check every 100 ms.
- The first queued job starts immediately after all submissions, so the real application's possible initial wait of up to one queue-timer interval is excluded. Subsequent jobs use the normal processor timer. HTTP authentication/controllers, browser transfer, download networking and frontend polling are outside this benchmark.
- Oracle verification runs sequentially only after every timed export in the batch has finished. It cannot compete with export work or inflate the measured queue latency. Every output is checked against the independent fixture oracle, including all headers, values, nonblank numeric/text types, missing/extra rows, ordering and PSF masking. A failed or aborted batch cannot count as correctness acceptance.
- Node initialization/imports and fixture seeding are excluded from timings. Every batch gets a fresh Node process; database caches remain shared. Level order rotates across the three small-data repeats to reduce systematic cache bias.
- Node RSS is sampled externally every 250 ms, including all concurrent work in that process. It is not per-job memory. The child also samples its own RSS and measures CPU time and event-loop delay. PostgreSQL and runner-parent memory are outside Node RSS; separate cgroup total/anonymous measurements include them and the reclaimable filesystem cache.
- Limits: 600 seconds per batch, 6,144 MiB child RSS and 6,800 MiB cgroup anonymous memory. A guard kills only its benchmark child and records the failure. The temporary PostgreSQL cluster is owned by this run and cleaned up afterward.

The environment reports an 8 GiB memory limit and CPU quota `200000 100000` (two CPU cores). Parallel 100,000-row batches are capped at two jobs; four large jobs are not measured. Small-data levels run three repeats; large-data levels run one repeat. Reported job medians describe these samples and are not p95 estimates or production-capacity guarantees.

## Reproduce

From `backend`, with existing dependencies installed and local PostgreSQL startup permitted:

```bash
npm run test:export:concurrency -- --sizes=780 --repeats=1 --output-dir=../.cache/export-concurrency-smoke
npm run test:export:concurrency -- --output-dir=../.cache/export-concurrency-final
```

The runner is [verify-export-concurrency.ts](../../backend/scripts/verify-export-concurrency.ts). It reuses the existing seed, candidate and independent XLSX verifier from [verify-export-scale.ts](../../backend/scripts/verify-export-scale.ts), whose original CLI is preserved and remains safe to import. Generated workbooks, per-job metrics and per-batch logs stay in the indicated cache directories. Only synthetic data is loaded; no `.env` or configured application database is read.
