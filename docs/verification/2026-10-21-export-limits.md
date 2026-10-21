# Excel export speed and memory limits

Date: 21 October 2026. Branch `perf/excel-export` (PR #95) with `main` at `620b0a2` merged in. Synthetic data on a throwaway local database in a 4-CPU cloud container; not deployment acceptance and not a measurement of the production server.

## What changed

PR #95 reads each export from one consistent snapshot and builds every workbook (direct and queued) in a worker. This record adds three settings on top:

| Setting | Default | Effect |
| --- | --- | --- |
| `EXPORT_SYNC_THRESHOLD` | 10000 (was 2000) | Exports with at most this many requests are a Direct Export; larger ones become an Export Job |
| `EXPORT_SYNC_MAX_CONCURRENT` | 2 | At most this many Direct Exports run at once; another export within the threshold becomes an Export Job |
| `EXPORT_WORKER_MAX_MEMORY_MB` | 1024 | Export Memory Limit for each workbook worker; an export that needs more fails on its own (413, or a failed Export Job) and is not retried |

The route also fixes `draft-lifecycle.postgres.test.ts` "renders an export when the app starts outside the backend directory", which failed on PR #95 because the TypeScript worker could not find `tsconfig.json` from another working directory.

## Method

PostgreSQL 16.15 on port 5433, seeded with PR #95's fixture (`seed(pool, 5570)` from `backend/scripts/verify-export-scale.ts`): 5,570 submitted requests, 37 Drafts, 217,230 canonical values, 76 output columns. Each build was compiled (`nest build`) and its `ExcelExportService` called directly, so HTTP and the queue's polling are not included. Memory is the process peak (`VmHWM`) minus the resting size, in a fresh process per case.

## Results

Speed, `exportAllRequests`, three runs per role after one warm-up:

| Build | Database pages | Workbook | Total |
| --- | ---: | ---: | ---: |
| `main` | 2.55–2.85 s | ~3.5 s | 5.8–6.6 s |
| PR #95 | 0.85–0.90 s | ~1.1 s | 1.89–2.01 s |

Both builds produce the same 423,396 cell values and types for Admin and for Requester. The only differences are multi-line texts, where PR #95 keeps the stored CRLF and `main` dropped the CR. The file grows from 1.76 MB to 2.39 MB (compression level 1 and cell styles).

Memory added by exports of 5,570 requests (Admin):

| Build | Exports at once | Added |
| --- | ---: | ---: |
| `main` | 1 (queued path) | 706–762 MB |
| `main` | 4 (direct path) | 1,847 MB |
| PR #95 | 1 | 243–261 MB |
| PR #95 | 2 | 443 MB |
| PR #95 | 4 | 785 MB |

With default settings, three simultaneous `tryDirectExport` calls of 5,570 requests returned two workbooks and one "busy" (which the route queues) in 2.2 s, adding 433 MB.

Export Memory Limit: the 5,570-request export fails at `EXPORT_WORKER_MAX_MEMORY_MB=64` and passes at 96 and above, both with and without `NODE_OPTIONS=--max-old-space-size=8192`.

## Findings that shaped the limit

- A process-wide `--max-old-space-size` (flag or `NODE_OPTIONS`) replaces every worker's `resourceLimits`: with it set, a worker given 16 or 64 MB reported an 8,240 MB heap limit and grew to 3.6 GB. The workbook builder therefore also checks its own heap between pages and every 500 rows, which is what enforces the setting in that case.
- A hard limit below what V8 needs to start a worker aborts the whole process ("Fatal JavaScript out of memory: GC during deserialization" at 1 MB). Loading the builder needs about 25 MB compiled and 52–68 MB from TypeScript sources, so the worker's hard limit is never set below 128 MB; smaller settings are enforced by the builder's own check.
- When an effective hard limit is reached while the export runs, only the worker stops (`ERR_WORKER_OUT_OF_MEMORY`) and the process keeps running.

## Tests

- Backend Jest: 49 suites, 738 tests passed, including `src/export/excel_export.limits.spec.ts` (real worker: memory limit, slot limit and default of two slots), the route's queue-when-busy and 10,000 default, and the Export Job's memory-limit message.
- All `test/*.postgres.test.ts` suites and `test/check-attachment-folders.test.ts` passed (97 tests), including the previously failing Draft lifecycle export test.
- ESLint on the changed files and `nest build` passed.

Not covered: the production server's hardware and real request data, a browser download through the Export page, and Excel opening the formatted file.
