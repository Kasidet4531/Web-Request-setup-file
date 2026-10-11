# 16. Every request Audit History entry stores a full Request Snapshot

Status: accepted (11 October 2026); implemented in source

Audit History must let a reader open one entry and see the whole PSF Request as it stood at that moment, with what that entry changed highlighted. We decided that every Audit History entry tied to a request stores a full Request Snapshot (the values of both forms, the Work Status and each form's Form Version) next to the per-field changes it already records. This replaces the "diff instead of full snapshots" choice in [ADR 0011](0011-key-by-key-diff-request-audit-logs.md); the per-field changes stay and are what the page highlights.

## Considered options

- **Rebuild past content by walking the per-field changes back from the current request.** Stores nothing new, but creation recorded no content, submit and a Draft Form Version upgrade change content without recording field changes, and Imported Requests have no entries. Any later save path that records an incomplete change would make every earlier view wrong without an error.
- **Full copies only at creation, submit and Form Version upgrade, with ordinary saves rebuilt from the nearest copy.** Roughly halves storage, at the cost of replay logic and the same silent-error risk. Kept as the upgrade path if measured size becomes a problem; waiting loses nothing because the per-field changes are still stored.
- **A baseline Request Snapshot of every existing request at deploy.** Rejected: it adds an entry that is not an event.
- **Chosen: a full copy in every request entry from deploy onward.** Each entry can be read on its own.

## Consequences

- Entries recorded before deploy have no Request Snapshot and keep only the changed-fields table. An Imported Request gets its first Request Snapshot with its first entry after deploy.
- The Form Schema is not copied. A Request Snapshot records Form Version numbers and the requester form is rendered with that version, which relies on published Form Versions staying immutable. PSF Created Information is rendered with the Form Schema the request captured at creation, which is never upgraded.
- Creation records the initial content, and submit and a Draft Form Version upgrade record their field changes, so the highlight is complete.
- A save that changes nothing writes nothing: no entry and no new revision. Bulk Status replacement by an Admin keeps its per-request entries but stores no Request Snapshot, because it can touch thousands of requests without changing form content.
- Visibility is unchanged and applied on read: a Requester sees no PSF Created Information in any Request Snapshot before PSF Visibility Release, Draft-period entries stay creator-only until submission, and permanently deleting a Draft deletes its Request Snapshots.
- Request Snapshots are kept for the life of the request. Size was estimated at a few KB each and has not been measured against the configured database.
