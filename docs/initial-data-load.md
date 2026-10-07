# Initial Data Load

`backend/scripts/initialize-data.ts` resets the PSF Request data and form configuration
from the PSF form detail workbook (sheets `Column_Mapping` and `Data`). It is a
one-time, destructive operation. Source is authoritative; this guide describes the
script as written on 8 October 2026. It has been exercised only against a disposable
in-memory database with a fabricated workbook (`backend/test/initialize-data.postgres.test.ts`),
not against the configured PostgreSQL or the real workbook.

## Running it

Start the backend once so its tables exist, then from `backend/`:

```bash
npm run db:initialize -- /path/to/workbook.xlsx          # dry run
npm run db:initialize -- /path/to/workbook.xlsx --yes    # apply
```

Connection settings come from `backend/.env` (`DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`); the target is printed first. Without `--yes` the whole load
runs inside a transaction and is rolled back, so the printed report is real. The load
takes table locks (`TRUNCATE`) for its duration; stop other traffic and take a
database backup before applying. Everything is one transaction: any error rolls back.

The report lists tables cleared, forms written, Status count, requests imported, Draft
rows skipped, Statuses outside the catalog (with counts), per-column counts of values
that did not fit their field, and mapped columns missing from `Data`. It prints counts and
Status names only, never other cell values.

## What it does

1. **Clears** `psf_requests`, `psf_request_search_index`, `canonical_submission_values`,
   `psf_request_audit_logs`, `draft_deletion_logs`, `draft_reminders`, `email_outbox`,
   `psf_export_jobs`, `form_definitions` and `autofill_rules`. It keeps `app_users` and
   `request_data_migrations`.
2. **Forms.** Requester columns (and `Creater/Requestor`) become `psf-request`; `Creater`
   columns become `psf-created-information` version 1. Columns with an empty "For" are
   Legacy Columns: they appear only in `psf-request` version 1 (status `published`). Version
   2 (`active`) has the Requester columns only. Every request keeps version 1 as its snapshot.
   `Request To` is the `product_type` field; `requester_name` is added (required) with value `NA`.
3. **Field details.** Label = "Column Name change" else "Column Name". Key = slug of the
   original name, except `Reference OLD PSF name`→`reference_psf_name`, `Fab.`→`wafer_fab`,
   `First Die Ref. ( X,Y )`→`first_die_ref_xy`, `Request To`→`product_type`. Types: Single
   line/Person or Group→text, Multiple lines→textarea, Number→number, Date and Time→date,
   Choice→radio (3 options or fewer) or select. Every field is optional and exportable except
   `product_type`/`requester_name` (required); the "Remark" and "Source" columns are not used.
4. **Status catalog** is replaced by the Status options in `Column_Mapping` (names verbatim).
   Names that match the former catalog keep their id and kind; others are `open`. Email policies
   are off and `100% -- Completed` is the only PSF Visibility Release trigger.
5. **Requests.** One per `Data` row, found by header name (whitespace-insensitive, with aliases
   for `NNR Recipr for WT3`, `Total Test Die (Enovia)` and `…NAS`). `PSF-` + `ID` padded to six
   digits is the request number. Requester is `NA` with no account, so Requesters do not see
   them in their own lists. `Created`/`Modified` give created/submitted and updated time;
   Completed rows also get `completed_at` and `psf_released_at` from `Modified`. Status is stored
   verbatim even when outside the catalog. Rows whose Status is `Draft` are skipped.
6. **Values.** Trimmed; `NA` (any case) becomes `NA` in text fields and empty in other types;
   Choice values are matched to the configured option ignoring case/spacing; dates become
   `YYYY-MM-DD`. Values that still do not fit (non-numeric Number, unknown option) are kept and
   counted; saving such a request requires correcting them.

## Known consequences

- A request whose Status is outside the catalog is listed and filterable but counted in no
  Open, Overdue or Completed total until someone changes its Status.
- Open requests with a past Due Date count as overdue. There is no Priority field, so the
  Dashboard shows the default "Normal".
- No audit history, notification or Draft Reminder is created for imported requests.
