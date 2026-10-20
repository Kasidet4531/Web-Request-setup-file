# Request Attachments and request IDs

Implemented in source on 20 October 2026 for issue #78. Source is authoritative;
this guide describes the source as of that change. It is not deployment
evidence: the checks it names ran against disposable databases and a temporary
directory standing in for the NAS (see [Verification](#verification)).

## Request ID and request numbers

Every PSF Request has a sequential integer **ID** (`psf_requests.numeric_id`,
`numericId` in request responses). It is the `[ID]` in the request's NAS folder
name and continues the Imported Requests' numbering.

- **Startup** adds the column if needed. An existing request numbered
  `PSF-NNNNNN` keeps that number as its ID (`PSF-000100` is ID 100). Any other
  request, such as a Draft created before this change, takes the next ID in
  creation order. The sequence `psf_request_numeric_id_seq` is then kept above
  the highest ID and never moves back, so a permanently deleted Draft's ID (and
  folder name) is never reused.
- **A new Draft** takes the next ID. Its request number stays
  `DRAFT-YYYYMMDD-NNNN` while it is a Draft.
- **Submitting a Draft** changes its request number to `PSF-` and the ID padded
  to six digits (`PSF-005571`). Requests submitted before this change keep their
  existing number.
- **The [Initial Data Load](initial-data-load.md)** stores each workbook row's
  `ID` and moves the sequence above the highest workbook ID, including skipped
  `Draft` rows, whose folders may exist on the NAS.

Source: [storage and submit](../backend/src/requests/requests.service.ts),
[load](../backend/scripts/initialize-data.ts).

## New Request default

New Request (`/requests/new`) starts its `title` field (Product_Description)
as `Product_Description`. The default is the form's saved baseline, so it does
not count as an unsaved change. Source:
[form](../frontend/src/components/ActiveSchemaForm.tsx).

## Storage

`ATTACHMENT_STORAGE_PATH` names the root folder: a Windows mapped drive
(`Z:\PSF`), a UNC path (`\\nas\share\PSF`) or a local directory. A backend
running as a Windows service does not see drives mapped in a user's logon
session; use a UNC path there. `ATTACHMENT_MAX_BYTES` limits each file (default
52428800, 50 MB); uploads are held in memory up to that size.

Without `ATTACHMENT_STORAGE_PATH`, Attachment routes answer 503 and
Product_Description changes rename nothing. When the root folder cannot be
reached, Attachment routes, Product_Description changes and permanent Draft
deletion answer 503 rather than proceeding, so an offline NAS never reads as an
empty folder and never drops metadata.

Each request has one folder directly under the root:

- `[Product_Description]_[ID]`, or `_[ID]` while Product_Description is blank.
  Product_Description is `requester_data_json.title`, trimmed, with
  `/ \ : * ? " < > |` and control characters replaced by `_`.
- Files keep their original names (any client path removed, characters Windows
  forbids replaced by `_`). A name already in the folder gets ` (1)`, ` (2)`…
  before its extension; nothing is overwritten.
- `.exe`, `.bat`, `.cmd`, `.com`, `.msi`, `.ps1`, `.sh` and `.vbs` files are
  refused, as are Windows/macOS system files (`Thumbs.db`, `desktop.ini`,
  `.DS_Store`, `~$…`), which listings also ignore.
- Saving a changed Product_Description renames the folder and updates stored
  paths in the same save; if the save fails, the rename is undone. If a folder
  with the new name already exists, the save is refused (409) and nothing moves.
- Permanently deleting a Draft removes its folder after the deletion commits; a
  failure to remove it is logged and leaves the folder in place.
- The Initial Data Load never touches the NAS.

Source: [storage](../backend/src/requests/attachment-storage.ts).

## Metadata and reconciliation

`psf_request_attachments` holds `id`, `request_id` (deleted with the request),
`filename`, `relative_path`, `mime_type`, `size_bytes`, `uploaded_by_user_id`,
`uploaded_by_display_name` and `created_at`; one row per file name and request.

Reading a request's Attachments reconciles the table with its folder: a file on
the NAS without a row gains one (no uploader; dated by the file's modification
time), a row whose file is gone is removed, and a changed size is updated. Only
regular files directly in the folder are listed. This is how the Imported
Requests' existing folders appear, and how files added or removed in Windows
Explorer show up the next time the request is opened.

Source: [service](../backend/src/requests/request-attachments.service.ts).

## Access and API

| Route | Who |
| --- | --- |
| `GET /api/requests/:requestId/attachments` → `{ folderName, canManage, items }` | Anyone who can see the request; Admin also on any Draft (read only) |
| `GET /api/requests/:requestId/attachments/:attachmentId/download` | Same as above |
| `POST /api/requests/:requestId/attachments` (multipart field `files`, up to 10) | The creator of a Draft; anyone signed in on a submitted request |
| `DELETE /api/requests/:requestId/attachments/:attachmentId` | Same as upload |

Attachments are shared across roles and teams. Uploads and deletions take
effect immediately: they need no form edit/save and do not change the request's
revision (`updatedAt`). Downloads are sent with `Content-Disposition:
attachment` and the exact UTF-8 name, `X-Content-Type-Options: nosniff` and a
sandboxing Content Security Policy.

Each upload records `ATTACHMENT_UPLOADED` and each deletion `ATTACHMENT_DELETED`
in Audit History, with `{ filename, sizeBytes, mimeType }`. These entries store
no Request Snapshot: they change no form content, and file bytes are never
stored in the database. Both actions are filterable on `/history`.

Source: [controller](../backend/src/requests/request-attachments.controller.ts).

## Screens

- **Submitted Request Detail:** tabs `Requester Information` |
  `PSF Created Information` | `Attachments` | `History`.
- **Draft Detail and Admin Draft inspection:** the Attachments section sits
  directly below Requester Information.
- **New Request:** files chosen before the first save are listed as "Not
  uploaded yet" and uploaded right after the Draft is created; the page then
  opens the Draft. If the upload fails, the files stay listed with the error and
  a retry button. Staged files count as unsaved work when leaving the page.
- Clicking an image (`png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `svg`) opens
  an Image Preview dialog with a Download button; clicking any other file
  downloads it. Deleting asks for confirmation.
- **Audit History** shows each request by its Product_Description, or
  `Untitled Draft (#ID)` (`Untitled Request (#ID)` once submitted) while it is
  blank, with the `PSF-` number beneath it. Draft numbers are not shown.

Source: [panel](../frontend/src/components/RequestAttachmentsPanel.tsx),
[detail and New Request](../frontend/src/components/RequestsWorkspace.tsx),
[Audit History](../frontend/src/components/GlobalHistoryPage.tsx).

## Verification

20 October 2026, on the feature branch:

- `backend/test/attachments.postgres.test.ts` (13 tests) runs `RequestsService`,
  the Attachment service and `AuditLogService` on in-memory PostgreSQL with a
  real temporary directory as `ATTACHMENT_STORAGE_PATH`;
  `initialize-data.postgres.test.ts` covers IDs and the sequence after a load;
  `request-attachments.controller.spec.ts` covers multipart upload with a Thai
  file name, the 413 limit, download headers and sign-in over HTTP.
- Frontend tests cover tab order, Draft placement, the default
  Product_Description, staged upload and its failure, preview versus direct
  download, delete confirmation and Audit History labels.
- A manual run of the built backend on a disposable PostgreSQL 16 with the Vite
  frontend in Chromium exercised New Request with staged files, the folder
  rename, submission to `PSF-000002`, the Attachments tab, preview, deletion and
  Audit History. The configured database and a real NAS share were not used.
