# 4. Write-Time Canonical Field Extraction and Search Indexing

We decided to extract canonical values and update the search index at write-time (when a request is saved, submitted, or updated) rather than querying JSONB dynamically at read-time.

## Context

Different form versions map fields (such as Probecard Name) to canonical keys for searching and exporting. We need to decide whether to extract these values when writing requests (persisting them in structured columns) or query and resolve them dynamically at read-time using JSONB functions.

## Decision

We chose Write-Time Canonical Extraction because:
- **Query performance**: Querying, sorting, and filtering flat columns in PostgreSQL (such as in `psf_request_search_index`) is orders of magnitude faster than parsing JSONB dynamically for every request, which is crucial for our search and export endpoints.
- **Maintainability**: The backend services (`SearchIndexService`, `CanonicalMappingService`) will handle the extraction logic cleanly during submission flows.
- **Reindexing Support**: If mapping rules are changed retrospectively, a backend admin utility will be created to run a batch reindex over historical JSONB responses to rebuild the canonical values.
