# 19. Excel export shows every field to every role

Status: accepted (21 October 2026, decided by Fook).

The Excel export and its Export Preview list every field of every form version, show `NA` in any cell without a value, and give every role the same cells: PSF Created Information is no longer blanked for a Requester before PSF Visibility Release. Fook chose this ("Show all in Excel only") knowing that the request page, the request list and keyword search still hide unreleased PSF Created Information from Requesters, so a Requester can read those values in an export but not on screen. Releasing them everywhere was the other option offered and was not chosen.

## Consequences

- PSF Visibility Release no longer governs exports. Export Jobs keep their owner and role checks, but every role's file has the same contents.
- Cells are read from each request's current data through its own captured form version, not from `canonical_submission_values`, which Status changes and PSF saves did not refresh. The `exportable` field flag no longer selects export columns.
- `NA` is shown only in the export and preview; it is never stored.
