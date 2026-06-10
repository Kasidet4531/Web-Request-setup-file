# 13. Excel Export Schema Alignment and Layout Strategy

We decided that the Excel Export will use a single flat table format (one request per row), where the columns are structured and ordered according to the latest active/published Form Schema version. Data from requests on older form versions will be dynamically mapped to these columns using canonical keys.

## Context

Because form schemas are dynamic and evolve over time, we need a consistent way to export a list of requests that might span different form versions. If we export requests with mismatched fields, we must decide how to align the columns in the Excel spreadsheet. We want a layout that is simple to analyze (flat table) and avoids cluttered sheets containing obsolete or misaligned columns.

## Decision

We chose the Latest Active Schema Alignment strategy for Excel exports:
- **Flat Table Layout**: The exported spreadsheet will consist of a single sheet where each row represents one PSF Request.
- **Latest Schema Column Structure**: The column headers of the Excel spreadsheet will match the fields defined in the **latest active/published Form Schema version** of the system.
- **Mapping Old Requests to Latest Columns**:
  - For requests that were submitted on older form versions, the backend will map their JSON data to the active columns using **Canonical Keys** (decided in ADR 0004).
  - If a field key matches directly, its value is populated in that column.
  - If a new field exists in the latest schema but did not exist in the old request, the cell in that column for the old request will be left empty (blank).
- **Handling Obsolete Fields**:
  - If an older request contains a field that has been completely deprecated in the latest schema (i.e., it has no matching field key or canonical key in the active schema), this obsolete field will be appended to the far right of the sheet, under its original historical label, so that historical data is not lost.
- **Benefits**:
  - **Clean Presentation**: Standardizes the columns to the system's current terminology and structure.
  - **Ease of Analysis**: A single sheet allows users to easily filter and sort the entire dataset of requests in Excel.
