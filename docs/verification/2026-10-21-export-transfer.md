# Export transfer over a slow database link verification — 21 October 2026

## Change and environment

Issue #102, filed by Fook after testing PR #100 against PostgreSQL reached
through Tailscale: a 5,570-request export took 35.9–44.0 s, 32.8 s of it
fetching 93.5 MB of request pages, because every row carried both captured
form snapshots in full; the Export Preview spent 548–585 ms grouping those
snapshots to find its columns.

- Export rows ([`search-index.service.ts`](../../backend/src/requests/search-index.service.ts))
  now carry a content key for each captured form snapshot, the MD5 of the
  snapshot's JSONB text, instead of the snapshot. JSONB text is canonical,
  so equal content gets equal keys and equal version numbers with different
  content get different keys. Each distinct snapshot is read once per
  export, from one request that captured it, inside the export's REPEATABLE
  READ snapshot.
- `psf_requests` stores both keys as generated columns,
  `schema_snapshot_key` and `psf_created_schema_snapshot_key`, which
  PostgreSQL recomputes whenever a snapshot changes; startup adds them to an
  existing database. Fook chose to store them (21 October) after the first
  measurement below showed that finding the preview's columns could not get
  faster without them.
- The Export Preview finds its columns by grouping the stored keys of every
  matching request and reads each distinct snapshot once, then its preview
  page reads no snapshot again
  ([`excel_export.service.ts`](../../backend/src/export/excel_export.service.ts)).
- A first version keyed snapshots by `jsonb_hash_extended`. Review found
  that two different forms can share that hash (for example `[[1],2]` and
  `[[1,2]]`, or two fields swapping their field keys), which would read one
  request's cells through another request's form; it was replaced by MD5
  before this record, and a test now covers two forms of the same version
  that differ only in which answer feeds which column.
- Base `926fa27` (PR #100). Node 22.22.0, PostgreSQL 16 from
  `embedded-postgres`, a throwaway cluster per run. The configured database
  and Fook's Tailscale path were not reachable from this environment.

## Measurements

[`scripts/measure-export-transfer.ts`](../../backend/scripts/measure-export-transfer.ts)
seeds the synthetic export fixture (5,570 submitted requests and 37 Drafts,
76 columns, four requester and three PSF Created Information snapshots) and
puts a TCP proxy in front of PostgreSQL that delays every packet 25 ms each
way and caps each direction at 24 Mbit/s, counting the bytes PostgreSQL
sends. It times the service calls (no HTTP layer), three runs each, for the
base, for keys computed in each query (`028e49d`) and for stored keys:

```
cd backend
runuser -u postgres -- node --require ts-node/register/transpile-only \
  scripts/measure-export-transfer.ts --rows=5570 --runs=3 --output=<report.json>
```

| Excel export, 5,570 requests | Before `926fa27` | Keys per query | Stored keys |
| --- | ---: | ---: | ---: |
| Total | 33.4–34.1 s | 8.9 s | 8.7–8.8 s |
| Pool wait | 0.2 ms | 0.2–0.3 ms | 0.2 ms |
| Request pages (12 queries) | 31.6–31.7 s | 7.1 s | 7.0–7.1 s |
| Captured form reads | none (inside the pages) | 1 query, 95–99 ms | 1 query, 68–96 ms |
| Active forms, BEGIN/COMMIT | 0.21 s | 0.21 s | 0.21 s |
| Workbook generation after COMMIT | 0.78–0.84 s | 0.83–0.87 s | 0.72–0.76 s |
| Bytes from PostgreSQL | 92,213,271–92,213,601 | 18,305,858–18,305,924 | 18,305,792–18,305,858 |
| `.xlsx` size | 2,429,008 bytes | 2,429,008 bytes | 2,429,007–2,429,008 bytes |
| Slowest `SELECT 1` through the same pool meanwhile | 58–66 ms | 54–61 ms | 54–61 ms |

| Export Preview, same filters | Before | Keys per query | Stored keys |
| --- | ---: | ---: | ---: |
| Total | 0.97–1.09 s | 0.93–1.07 s | 0.41–0.53 s |
| Finding columns (captured forms) | 0.58–0.67 s | 0.61–0.66 s | 89–128 ms |
| Preview page (10 rows) | 0.15–0.19 s | 0.11 s | 81–118 ms |
| Bytes from PostgreSQL | 229,938–230,462 | 97,630–98,154 | 97,366–97,890 |
| Slowest `SELECT 1` through the same pool meanwhile | 51–53 ms | 51 ms | 51 ms |

The first preview run includes about 0.1 s opening the pool's first
connection through the link. The rest of each export total is starting the
workbook worker and handing it rows. The slow link reproduced Fook's numbers closely before the change
(92.2 MB and 31.6 s of page fetching against 93.5 MB and 32.8 s); the
remaining 18 MB is the requests' own answers. One `SELECT 1` round trip on
the link is about 50 ms, so ordinary queries were not held up by an export.

With keys computed in each query, finding the preview's columns was no
faster: telling every distinct form apart exactly means PostgreSQL
decompresses each matching request's snapshots. On a local PostgreSQL 16
with the same fixture, grouping whole JSONB values took about 380 ms,
grouping their MD5 about 430 ms and `jsonb_hash_extended` about 160 ms (not
exact, see above). Grouping a stored MD5 column took 2–3 ms instead of
230–238 ms for one form family. Adding both columns in one statement, as
startup does, rewrote the 5,607-row table in 0.7 s (2.7 s right after
PostgreSQL restarted, with nothing cached) instead of 1.1 s for two
statements. With stored keys, what remains of finding the
columns is one round trip and the distinct snapshots themselves.

## Correctness

| Check | Command | Result |
| --- | --- | --- |
| Distinct forms read once | `node --require ts-node/register --test test/export-columns.postgres.test.ts` | new test fails on `926fa27` (an export of 12 requests read 26 form snapshots), passes after (6: two captured requester forms, two captured PSF forms and the two active ones); an "FPC" field and a "Probe Card" field on one of two snapshots with the same version number are exported for that request only, on the file's last row and on page 3 of 5-row pages, and the preview has the same headers |
| Same version, swapped field keys | same file | two forms of one version whose Field 1 and Field 3 swap their field keys export A,B,C and C,B,A; failed with `jsonb_hash_extended` keys, passes with MD5 |
| Stored keys | same file | fails before the key columns (`column "schema_snapshot_key" does not exist`); passes after: a database whose `psf_requests` lacks them gets both at startup, every key equals the MD5 of its snapshot before and after a snapshot changes, and the changed form's field is exported and previewed for that request only |
| Backend unit tests | `cd backend && npx jest` | 50 suites, 750 passed (after merging `main` at `e6dae03`; again with stored keys) |
| API integration | `cd backend && npm run test:e2e` | 21 passed, with stored keys |
| All PGlite suites | `node --require ts-node/register --test --test-concurrency=1 test/*.postgres.test.ts test/check-attachment-folders.test.ts` | 113 tests, 112 passed, 1 skipped (configured server only) |
| Frontend | `cd frontend && npx vitest run` | 533 passed |
| Export at scale | `runuser -u postgres -- node --require ts-node/register scripts/verify-export-scale.ts --sizes=780,5570 --output-dir=<dir>` | admin, setup_owner and requester at 780 and 5,570 requests, with requests reordered, deleted, inserted and their forms changed during the export: every cell matches (423,396 at 5,570), and each size's logical hash (`06a03bb…` at 780, `90e3eb2…` at 5,570) equals the same check's on `926fa27`, with keys computed per query and again with stored keys |

## Not verified

Fook's Tailscale path, the configured database, HTTP timings and the
77-column production forms. The script times the service calls; the file
handed to HTTP is the same size before and after, so its download is not
part of this change. The proxy models delay and bandwidth, not
Tailscale's packet loss or routing. Adding the key columns to the
configured database's `psf_requests` at startup was not timed there.
Captured-form records referenced by requests, the issue's data-model
follow-up, are not part of this change.
