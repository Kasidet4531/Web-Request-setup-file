# 13. Excel Export Schema Alignment and Layout Strategy

We decided that the Excel Export will use a single flat table format (one request per row), where the columns are structured and ordered according to the latest active/published Form Schema version. Data from requests on older form versions will be dynamically mapped to these columns using canonical keys.

## Context

Because form schemas are dynamic and evolve over time, we need a consistent way to export a list of requests that might span different form versions. If we export requests with mismatched fields, we must decide how to align the columns in the Excel spreadsheet. We want a layout that is simple to analyze (flat table) and avoids cluttered sheets containing obsolete or misaligned columns.

## Decision

We chose the Latest Active Schema Alignment strategy for Excel exports, enhanced with administrative layouts, performance optimization, and role-based cell masking:

- **Flat Table Layout**: The exported spreadsheet will consist of a single sheet where each row represents one PSF Request.
- **Latest Schema Column Structure**: The column headers of the Excel spreadsheet will match the fields defined in the **latest active/published Form Schema version** of the system.
- **Filtering & Conditions for Export**:
  - Users can filter and export data based on two options: **Export All** or **Filter by Specific Conditions**.
  - To prevent cross-version key/schema mismatch issues, search/filter conditions are restricted **strictly** to fields defined as **Canonical Keys** in the search index (e.g., `Probecard Name`, `Reference PSF Name`, `Status`, `Priority`, `Requester`, `Setup Owner`) and date parameters (enabling selection of specific Year, Month, or Date ranges for `Request Date` or `Due Date`). Dynamic, non-canonical fields cannot be filtered on.
- **Admin Layout Configuration (Export Settings)**:
  - Administrators can configure, reorder (via drag-and-drop), and enable/disable columns (including both active and obsolete fields) through the "Export Settings" dashboard.
  - Any obsolete fields not explicitly ordered by the admin will default to a fallback group positioned on the far right of the sheet or be hidden according to admin configuration.
- **Mapping Old Requests to Latest Columns**:
  - For requests that were submitted on older form versions, the backend will map their JSON data to the active columns using **Canonical Keys** (decided in ADR 0004).
  - If a field key matches directly, its value is populated in that column.
  - If a new field exists in the latest schema but did not exist in the old request, the cell in that column for the old request will be left empty (blank).
- **Handling Obsolete Fields**:
  - If an older request contains a field that has been completely deprecated in the latest schema, and it is enabled in the Export Settings, it will be placed in the designated column order (or appended to the far right if unconfigured) under its original historical label.
  - **Dynamic Obsolete Columns compilation**: Obsolete columns are dynamically appended to the output sheet **only if** there is at least one record in the exported subset that contains a non-empty value for that obsolete field. Deprecated fields with no values in the current export set are omitted to keep the sheet clean.
- **Data Type Serialization**:
  - **Primitive Values (String, Number, Boolean)**: Exported as-is.
  - **Arrays (e.g., Multi-select)**: Joined into a single string using a comma (`,`) as a separator (e.g., `Product A, Product B`).
  - **Nested JSON Objects**: Extracted to specific sub-fields (e.g., `.name` or `.value`) or serialized as a simplified readable string (e.g., `key: value`), avoiding raw JSON dumps or `[object Object]`.
- **Security & Cell-Level Masking**:
  - **Uniform Column Structure**: All users share the same column layout.
  - **Status-based Masking for Requesters**: If a user with the `Requester` role exports the data, any columns in the `PSF Created Information` section for requests that are not yet in `PSF Created` or `Completed` status must have their cells blanked out or filled with `N/A (Pending Setup)` to prevent premature visibility of the setup information.
- **Date & Time Formatting**:
  - All date fields in the Excel output will be rendered in the system's default timezone (**`Asia/Bangkok` / GMT+7**).
  - The cells will be formatted in the Excel file as Date cells in the `YYYY-MM-DD` format (without the time portion), allowing users to filter, sort, and calculate dates natively in Excel.
- **Performance & Memory Optimization**:
  - **Synchronous Streaming (Threshold < 2,000 records)**: For queries returning fewer than 2,000 records, the backend streams the spreadsheet immediately using a database cursor to minimize memory footprint.
  - **Asynchronous Background Job (Threshold >= 2,000 records)**: Queries returning 2,000 or more records will trigger an asynchronous background job. The user is notified when the file is ready, and they download it via a temporary URL.
- **Export Filename**:
  - Exported files will be dynamically named: `psf_requests_[YYYYMMDD_HHMMSS].xlsx` (e.g., `psf_requests_20260611_102020.xlsx`) using the default system timezone.

## Benefits

- **Clean & Consistent Presentation**: Standardizes columns to the system's current terminology, with administrative control over layout order.
- **Ease of Analysis**: A single sheet allows users to easily filter, sort, and calculate date columns natively in Excel.
- **Data Integrity**: Obsolete columns are preserved on the far right or according to admin settings, preventing loss of historical data.
- **Security Compliance**: Enforces workflow visibility rules dynamically in exported spreadsheets using cell-level masking.
- **Scalability**: Prevents backend memory exhaust through database streaming and background processing.

