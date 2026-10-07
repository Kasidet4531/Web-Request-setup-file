# 15. Initial Data Load keeps Legacy Columns as Form Version 1 and uses Request To as Product Type

Status: accepted (8 October 2026)

The PSF form detail workbook replaces the existing form configuration and requests in a single destructive Initial Data Load ([guide](../initial-data-load.md)). We decided that columns the workbook assigns to no audience (Legacy Columns) stay in the data as `psf-request` Form Version 1, while the active Version 2 holds only audience-assigned columns, and that the workbook's **Request To** field becomes the Product Type that drives the Dashboard Team Group.

## Considered options

- **Drop Legacy Columns and their values.** Simplest, but loses old values (Due Date, Start Date, Created By and others) for 5,000+ historical requests, and Due Date feeds the overdue totals.
- **One version with every column.** Keeps the data but shows retired fields on every new request.
- **Chosen: Version 1 with Legacy Columns, Version 2 without.** Reuses the existing per-request schema snapshot, so old requests keep their fields, new requests do not, and export combines both by canonical key.
- **Product Type options kept as New/Transfer/Existing, mapped from Request To.** Needs no code change but diverges from the workbook's dropdown and drops the required-document hints in its options. We instead made the Team Group recognise both sets of options.

## Consequences

- Imported Requests carry Version 1 snapshots and cannot be moved to Version 2 by an automatic upgrade; a Draft schema upgrade does not apply to them.
- The Team Group SQL and `productTypeLabel` match option text by prefix (`Create new PSF`, `Revise from old PSF`, `Product Transfer`). Reword those options in Form Management and affected requests fall into "รอระบุ Product Type" until the prefixes are updated.
- Rolling back is a second Initial Data Load from a workbook, not a migration.
