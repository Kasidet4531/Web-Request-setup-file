# Initial Data Load

`backend/scripts/initialize-data.ts` resets the PSF Request data and form configuration
from the PSF form detail workbook (sheets `Column_Mapping` and `Data`). It is a
one-time, destructive operation. Source is authoritative; this guide describes the
script as updated on 19 October 2026 ([ADR 0015](adr/0015-initial-data-load-legacy-form-version-and-request-to.md), [ADR 0017](adr/0017-verbatim-workbook-data-and-core-actor-schedule-fields.md)). Automated tests use a disposable in-memory database
with a fabricated workbook (`backend/test/initialize-data.postgres.test.ts`). The censored
workbook (`PSF_form_detail-censor.xlsx`) is loaded into the configured PostgreSQL (`psf_setup_db`) without
`--lenient`: 5,570 requests (43 `Draft` rows skipped), 3 form versions and a 12-entry Status catalog.

## Running it

Start the backend once so its tables exist, then from `backend/`:

```bash
npm run db:initialize -- /path/to/workbook.xlsx          # dry run
npm run db:initialize -- /path/to/workbook.xlsx --yes    # apply
```

Add `--show-values` to a dry run to see which values do not fit.

Add `--lenient` only for synthetic/disposable test runs where you want non-fitting values blanked and broken rows skipped. For the real workbook load, run **without** `--lenient` so all historical cell values in `Data` are preserved verbatim in the database.

Connection settings come from `backend/.env` (`DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`); the target is printed first. Without `--yes` the whole load
runs inside a transaction and is rolled back, so the printed report is real. The load
takes table locks (`TRUNCATE`) for its duration; stop other traffic and take a
database backup before applying. Everything is one transaction: any error rolls back.

The report lists tables cleared, forms written, Status count, requests imported, Draft
rows skipped, Statuses outside the catalog (with counts), per-column counts of values
that did not fit their field (rows and distinct values), `--lenient` skipped rows by reason, and mapped columns missing from `Data`.
It prints counts and Status names only. With `--show-values` it also lists the ten most frequent
non-fitting values per column, which are real data: use it only in your own terminal.

## What it does

1. **Clears** `psf_requests`, `psf_request_search_index`, `canonical_submission_values`,
   `psf_request_audit_logs`, `draft_deletion_logs`, `draft_reminders`, `email_outbox`,
   `psf_export_jobs`, `form_definitions`, `autofill_rules` and the Attachment metadata
   `psf_request_attachments`. It keeps `app_users` and `request_data_migrations`, and never
   touches the NAS: each request's existing folder is listed again when the request is opened.
2. **Forms.** Requester columns (plus `Creater/Requestor`, `Due Date`, and `Start Date`) become `psf-request`; `Creater`
   columns become `psf-created-information` version 1. Columns with an empty "For" other than `Due Date` and `Created By` (`Workflow Name`, `Item Type`, `Path`) are
   Legacy Columns: they appear only in `psf-request` version 1 (status `published`). Version
   2 (`active`) has the Requester columns (including `due_date` and `start_date`). Every imported request keeps version 1 as its snapshot. In the UI, `Start Date`, `Requester`, and `Modified By` are shown in the header metadata (`Start Date | Due Date | Requester | Modified By`) rather than rendered inside the form grid.
   `Request To` is the `product_type` field; `requester_name` (`Requester Name`, `canonicalKey: 'requester'`, required) and `modified_by` (`Modified By`, `canonicalKey: 'modified_by'`, read-only) are placed right after `product_type` in both version 1 and version 2.
3. **Field details.** Label = "Column Name change" else "Column Name". Key = slug of the
   original name, except `Reference OLD PSF name`→`reference_psf_name`, `Fab.`→`wafer_fab`,
   `First Die Ref. ( X,Y )`→`first_die_ref_xy`, `Request To`→`product_type`. Types: Single
   line/Person or Group→text, Multiple lines→textarea, Number→number, Date and Time→date,
   Choice→radio (3 options or fewer) or select. Every field is optional and exportable except
   `product_type`/`requester_name` (required); the "Remark" and "Source" columns are not used.
4. **Status catalog** is replaced by the Status options in `Column_Mapping` (names verbatim),
   in the workbook's order, which replaces any order an administrator set in Status Management.
   Names that match the former catalog keep their id and kind; others are `open`. Email policies
   are off and `100% -- Completed` is the only PSF Visibility Release trigger.
5. **Requests.** One per `Data` row, found by header name (whitespace-insensitive, with aliases
   for `NNR Recipr for WT3`, `Total Test Die (Enovia)` and `…NAS`). `ID` is the Request ID
   (`numeric_id`) and `PSF-` + `ID` padded to six digits is the request number. New Drafts
   continue above the highest workbook `ID`, skipped `Draft` rows included, since their NAS
   folders may exist ([Request Attachments](request-attachments.md)). `Created By` populates `psf_requests.requester`, `psf_request_search_index.requester`, and `requester_data_json.requester_name` (fallback `NA` if blank), while `requester_user_id` remains `NULL`. `Modified By` populates `requester_data_json.modified_by` (fallback to `Created By`). `Created`/`Modified` give created/submitted and updated time;
   Completed rows also get `completed_at` and `psf_released_at` from `Modified`. Status is stored
   verbatim even when outside the catalog. Rows whose Status is `Draft` are skipped. `psf_setup_file_name` from `psf_created_data_json` is indexed into `psf_request_search_index.psf_setup_file_name`. A Requester `Request For` column becomes the `request_for` field (canonical key `request_for`), and its value is indexed into `psf_request_search_index.request_for` for the Request For column of the Requests and Dashboard tables (24 October 2026).
6. **Values.** Trimmed; `NA` (any case) is normalized to `NA` and kept in all field types;
   Choice values are matched to the configured option ignoring case/spacing; dates become
   `YYYY-MM-DD`. Values that still do not fit (non-numeric Number, unknown option) are kept verbatim in default mode and
   counted in `mismatches` (or blanked under `--lenient`). When editing a request, unchanged legacy Choice/Radio values remain selectable and valid unless the user changes that field to a new value.

## Known consequences

- A request whose Status is outside the catalog is listed and filterable but counted in no
  Open, Overdue or Completed total until someone changes its Status.
- Open requests with a past Due Date count as overdue. There is no Priority field, so the
  Dashboard shows the default "Normal".
- No audit history, notification or Draft Reminder is created for imported requests.
