# 12. Schema-Embedded Master Data Configuration

We decided to embed Master Data dropdown options (such as Products, Wafer FABs, Priority levels, and Machines) directly within the JSON Form Schema definitions rather than maintaining separate relational lookup tables and dedicated CRUD administration interfaces for each master data type in the MVP.

## Context

The system requires structured dropdown lists for several fields (e.g., Wafer FAB, Product, Priority, and Machine) to enforce data quality and support search and auto-fill logic. In traditional database designs, these dropdown values are stored in dedicated master reference tables (e.g., `master_products`, `master_wafer_fabs`) managed via separate CRUD admin pages. While clean, this approach requires building and maintaining multiple database entities, API endpoints, and frontend management forms, which adds substantial development time for the MVP.

## Decision

We chose to use Schema-Embedded Master Data:
- **Embedded Schema Configuration**: The list of valid options for select fields will be defined directly in the `options` array of the respective field definitions within the dynamic `schema_json` (e.g., `"options": ["FAB-A", "FAB-B"]`).
- **Unified Schema Administration**: Administrators will manage these options using the dynamic JSON Schema Editor (decided in ADR 0007). To add a new Wafer FAB or Product, the admin simply edits the list of options in the active form schema and publishes the new version.
- **Simplification**: This eliminates the need to write separate tables, database migrations, repository models, and CRUD interfaces for 7 different master reference entities.
- **Data Integrity**: Historical requests retain their options as part of the `schema_snapshot_json` recorded at the time of submission (decided in the main specification), which prevents broken displays if options are later deleted from active configurations.
