# 23. Go-live starts from an empty database loaded once from the final MIS export

Status: accepted (24 October 2026, decided by Fook); the go-live date is not fixed.

The old SharePoint web stays in use until go-live, so the new web's test database will miss its last requests, and request IDs from the two webs would collide if both took requests. Fook chose not to build an incremental import. At go-live the old web stops taking requests, the final MIS export is loaded into an empty database with one Initial Data Load, and then the new web opens. Everything administrators set while testing (Form Schemas, the Work Status catalog and its settings, Status Email Policies, Autofill Rules, Team Capacity) is entered again from the admin checklist (plan item 26).

## Considered options

- **Append-only import** of the old web's newer requests into the running database (recommended in plan v2 and v3). Rejected for now: not needed when the switch happens once.
- **Export and import of admin settings.** Deferred: worth building only if entering them again takes too long.

## Consequences

- Every fix in the review plan should be finished before go-live (plan Q29).
- Columns retired from the form (the grey, blank-`For` rows of the field list) must keep a blank `For` in the final workbook so they stay Legacy Columns.
