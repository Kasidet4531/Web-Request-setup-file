# Request Snapshot verification — 11 October 2026

## Scope and environment

Checks for issue #74 ([ADR 0016](../adr/0016-full-request-snapshot-per-audit-history-entry.md)) on branch
`worktree-bridge-cse_01E1EFTCskwqek3KgPGKoEQx`, with `main` at `31c6257` merged in.
Every suite was also run on an untouched copy of `main` at `31c6257`, so that a
failure can be told apart from one that was already there.

Node 24.21.0; browser suites used the existing Playwright with
`EMAIL_E2E_CHROME=/usr/bin/google-chrome`. The repository has no CI workflow.
This record proves only the checks named here. No deployment, company LDAP or
mail endpoint was exercised.

## Suites, branch against `main`

| Check | Command (from `backend` or `frontend`) | `main` 31c6257 | Branch |
| --- | --- | --- | --- |
| Backend unit | `npx jest` | 702 passed | 704 passed |
| Frontend unit | `npx vitest run` | 476 passed | 491 passed |
| In-memory PostgreSQL | `node --require ts-node/register --test test/<file>` for each `*.postgres.test.ts` and `draft-reminders.concurrent.test.ts` | 58 passed | 71 passed, 1 skipped |
| Request Snapshot in the browser | `node --test test/request-snapshot-system.e2e.mjs` | not present | 1 passed |
| Other browser suites | `node --test --test-concurrency=1` on the email, fixture, PSF-trigger, loading, form-management and Draft lifecycle suites | 14 passed, 4 failed | 14 passed, the same 4 failed |
| HTTP suite | `npx jest --config ./test/jest-e2e.json` | 14 passed, 6 failed | 14 passed, the same 6 failed |
| Type check | `npx tsc --noEmit -p tsconfig.json`; `npx tsc -b --noEmit` | 5 errors in spec files; 0 | the same 5; 0 |
| Lint | `npx eslint "{src,test}/**/*.{ts,mjs}"`; `npx eslint .` | 3 errors; 1 | 2 of the same 3; the same 1 |
| Builds | `npm run build` in both packages | passed | passed |

The skipped test needs the configured server and is reported below. The third
backend lint error on `main` was formatting in `audit_log.service.ts`, a file this
change reformatted.

### Failing on `main` as well

These fail identically on the untouched copy of `main`; this change did not
introduce them and does not fix them.

- HTTP suite (`test/app.e2e-spec.ts`): `/api/forms/psf-request/schema (GET)`; three `/api/requests/export.xlsx` tests; the Draft schema upgrade route; the bracketed publish query.
- `test/email-system.e2e.mjs`: "combined status editor preserves recipients and rolls back name and policy together".
- `test/loading-system.e2e.mjs`: expects "Open work" in the Dashboard queue heading.
- `test/form-management-system.e2e.mjs`: "copied versions hide both stored seed descriptions while preserving custom admin descriptions".
- `test/email-system.draft-lifecycle.e2e.mjs`: "Admin reads foreign Drafts without mutation rights; creator/Admin permanent deletion purges retained content".
- Lint: `src/admin/autofill-rule-schema.ts` and `src/audit/audit_log.paging.spec.ts` (formatting); `GlobalHistoryPage.test.tsx` (`no-useless-assignment`).

## Configured PostgreSQL server

Target: the server and database named by `backend/.env` (`psf_setup_db`),
PostgreSQL 15.19, timezone Asia/Bangkok, 5,570 requests and no Audit History
entries at the time.

### How its tables were kept untouched

`backend/test/request-snapshot.postgres.test.ts` ran there with
`REQUEST_SNAPSHOT_CONFIGURED_POSTGRES=1` and `node --env-file=.env`
([helper](../../backend/test/configured-postgres.ts)):

1. One session with `search_path = pg_temp`, so every table name the application
   uses resolves to a session-temporary table or fails. The helper first proves
   that an unqualified `CREATE TABLE` lands in the temporary schema.
2. Application SQL that names the `public` schema other than through
   `to_regclass('public.…')` is refused before it is sent.
3. After the temporary tables exist the session runs with
   `default_transaction_read_only = on`; PostgreSQL then rejects any write to a
   non-temporary table. It is lifted only around storage changes to temporary tables.

Four temporary tables start as structure-only copies of the configured ones
(`LIKE … INCLUDING ALL`), so the storage upgrade ran against the real table
shape. Real requests were read inside a `READ ONLY` transaction and copied into
the temporary table. The configured tables have no sequences or user triggers.

A read-only probe before and after the run returned the same tables, columns and
row counts: 5,570 requests, 0 Audit History entries, and no
`request_snapshot_json` column on `psf_request_audit_logs`. That column is added
when a backend with this change first starts against the database.

### Result: 13 of 13 passed

| Checked | Test |
| --- | --- |
| Persistence | first Request Snapshot holds the content a request was created with; one per save, earlier ones unchanged; Work Status of the time on submit and Status change |
| Transaction rollback | a change whose Audit History entry cannot be recorded leaves the request, its revision and its history as they were |
| Historical rendering | a Draft Form Version upgrade lists removed fields; an earlier Request Snapshot is shown in its own Form Version; a missing Form Version fails instead of showing another |
| Visibility | PSF Created Information hidden from a Requester until release, in every Request Snapshot; Draft-period ones private to the creator, including from Admin |
| Deletion | deleting a Draft deletes its Request Snapshots |
| No-op save | writes nothing: no entry and the same revision |
| Exceptions | bulk Status replacement and earlier entries have no Request Snapshot |
| Storage upgrade | the column is added to an existing audit table; its earlier entries stay without a Request Snapshot |
| Real requests | below |

### Real requests

500 real requests (chosen by a hash of their id) were copied into the temporary
table. The run printed counts only.

- All 500 got their first Request Snapshot on a Status change, equal to the request's content, in Form Version 1.
- 391 were unreleased; a Requester saw no PSF Created Information in their Request Snapshot.
- 181 then accepted an edit of one text field and got a second Request Snapshot, with the first unchanged.
- 319 refused that edit with "missing required fields". This is the loaded data, not this change: a read-only count shows 3,563 of the 5,570 requests have an empty Request To (`product_type`), which their form requires, so any Requester Information save on them is refused until it is filled. Status changes are not affected.
- Stored size: 681 Request Snapshots, 1,584 bytes on average and 1,879 at most. Built but not stored for all 5,570 requests, the same content is 2,410 bytes on average and 3,188 at most before compression.

## In the browser

`test/request-snapshot-system.e2e.mjs` runs the compiled frontend and backend on
a disposable PostgreSQL: edit a field on Request Detail, see the new entry in the
History tab without reloading, save again without a change and get no entry and
no error, open "View Request Snapshot" and see the previous value on the changed
field only, follow the breadcrumb, and open an earlier entry from Audit History
that still shows the earlier content.

## API compatibility

`hasSnapshot` was added and renamed to `hasRequestSnapshot` within this branch
(`git log --all -S"hasSnapshot"` lists four commits, none on `main`), so nothing
released reads the old name. Against `main` the history responses only gain `id`
and `hasRequestSnapshot`; no field was removed or renamed. A newer backend with an
older frontend ignores the additions; a newer frontend with an older backend
shows no "View Request Snapshot" link.

## Not verified

- The configured tables themselves were never written, so the first real start of this backend against that database (which adds the column) has not happened.
- The temporary-table run uses one session: it does not exercise the connection pool or two editors at once.
- The browser flow ran on a disposable PostgreSQL, not the configured one.
- Light and Dark were not compared visually for the new page.
