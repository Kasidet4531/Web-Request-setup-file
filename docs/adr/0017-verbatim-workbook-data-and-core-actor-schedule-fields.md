# 17. Verbatim workbook data, legacy option preservation, and core actor/schedule fields

Status: accepted (19 October 2026). Decision 2 amended 21 October 2026: Modified By is recorded on every save whether or not the form has a `modified_by` field; see [current implementation](../current-implementation.md).

When reloading `psf_setup_db` from `PSF_form_detail-censor.xlsx` ([guide](../initial-data-load.md)), we aligned the stored request records and form schemas with the `Data` sheet so historical values are preserved verbatim and core actor and schedule fields (`Requester`, `Modified By`, and `Due Date`) remain first-class across both historical and active forms.

## Context

- The initial load on 8 October 2026 ran with `--lenient` against an uncensored workbook, blanking historical Choice/Radio values that did not match `Column_Mapping` dropdown options (including `NA` in `Test temp for WT1–WT4 (c)`, `NNR Recipe for WT1`, and `Diameter (Inch)`), setting `psf_requests.requester` and `requester_name` to `NA` instead of `Created By`, omitting `Modified By`, treating `Due Date` as a Version 1-only Legacy Column, and leaving `psf_request_search_index.psf_setup_file_name` unpopulated.
- 697 historical rows in `Data` also use the legacy `Request To` phrasing `Revise Old PSF (...)` rather than `Revise from old PSF (...)`.

## Decisions

1. **Keep workbook `Data` values verbatim by default (no `--lenient` blanking, no `NA` blanking in Choice fields).**
   - `initialize-data.ts` keeps all trimmed non-empty cell values from `Data` in `requester_data_json` and `psf_created_data_json`, including `NA` and historical Choice/Radio values outside `Column_Mapping` options, while reporting non-fitting counts in `mismatches`.
   - When editing an existing request (`DynamicFormRenderer`, `validateAndNormalizeFormData`, `assertValidRequiredFormData`), a `select` or `radio` field renders its current stored value in the control options and allows saving when that value is left unchanged, while still requiring any newly changed selection to come from `field.options`.
2. **Map `Created By` directly to `Requester` (`requester_name`) and track `Modified By` (`modified_by`) automatically at the same level.**
   - `Created By` populates `psf_requests.requester`, `psf_request_search_index.requester`, and `requester_data_json.requester_name` (`canonicalKey: 'requester'`) without creating a duplicate `created_by` field in Version 1, while keeping `requester_user_id = NULL` on Imported Requests so private ownership scopes remain bound to local accounts only.
   - `Modified By` (`fieldKey: 'modified_by'`, `canonicalKey: 'modified_by'`) is included as a read-only actor identity field alongside `requester_name` in both `psf-request` Version 1 and Version 2, displayed alongside `Requester` in the request header summary, initialized from `Modified By` on Imported Requests (or `actor.displayName` on new Drafts), and updated automatically to `actor.displayName` whenever a request's data, schema, or status is modified.
3. **Promote `Due Date` (`due_date`) and `Start Date` (`start_date`) to the active `psf-request` Version 2 schema while keeping retired columns in Version 1, and display automatic metadata in the header only.**
   - `Due Date` and `Start Date` are included in both Version 1 and Version 2. `Due Date` remains an editable field in the form, while `Start Date` (`start_date`), `Requester Name` (`requester_name`), and `Modified By` (`modified_by`) are server-owned automatic metadata omitted from `DynamicFormRenderer` and displayed in the request header summary (`Start Date | Due Date | Requester | Modified By`). Other blank-`For` columns (`Workflow Name`, `Item Type`, `Path`) remain Legacy Columns in Version 1 only.
4. **Index `psf_setup_file_name` in `psf_request_search_index` and include `Revise Old PSF%` in the MFG Team Group.**
   - Both `initialize-data.ts` and `RequestsService` populate `psf_request_search_index.psf_setup_file_name` from `psf_created_data_json`, and `SearchIndexService` / `productTypeLabel` classify `Revise Old PSF%` under `MFG`.

## Consequences

- Setup Owners and Admins can edit any field on an Imported Request without being forced to overwrite historical Choice/Radio values in untouched fields.
- Every request displays both `Requester` (creator) and `Modified By` (last modifier) consistently in the header metadata, form, and Excel export.
