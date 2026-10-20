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
(`Z:/attachment` or `Z:\attachment`, a drive root such as `Z:/` included), a
UNC path (`\\nas01\share\attachment`) or a local directory. A mapped drive
works only while the backend runs in the logon session that maps it: a backend
running as a Windows service does not see `Z:`, so use the share's UNC path
there or run the service as an account that maps the drive. The startup log
reports whether the folder can be reached. In `backend/.env` write the path
unquoted (`ATTACHMENT_STORAGE_PATH=Z:/attachment`): inside double quotes `\n`
becomes a line break. Restart the backend after changing it.
`ATTACHMENT_MAX_BYTES` limits each file (default 52428800, 50 MB); uploads are
held in memory up to that size.

Any number of files can be attached. The browser sends them in batches of up
to 10 per request; after a failed batch only the files not yet uploaded are
retried. On a Windows share, renaming a folder or deleting a file that someone
has open is refused with "in use on the NAS" (409) and nothing changes.

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

## Checking existing NAS folders

Before deploying, compare the folders already on the NAS with the names the app
will look for. From `backend/`, with `backend/.env` holding the database
settings and `ATTACHMENT_STORAGE_PATH`:

```bash
npm run attachments:check                         # counts and the first 20 problems
npm run attachments:check -- --csv report.csv     # every finding, opens in Excel
npm run attachments:check -- --root Z:/attachment # another folder than the .env one
```

It only reads: the database inside a read-only transaction and the folder
names directly under the root. It also runs on a database from before Request
IDs, taking each ID from the `PSF-NNNNNN` number. It reports:

| Count | Meaning |
| --- | --- |
| `matched` | The expected `[Product_Description]_[ID]` folder exists |
| `caseOnly` | It differs only in letter case: the same folder on a Windows share |
| `noFolder` | No folder ends with the ID, as for a request with nothing attached |
| `renamed` | A folder with the ID exists under another name: **the app will show no files** until it is renamed to the expected name |
| `duplicates` | More than one folder ends with the same ID; the app uses only the expected one |
| `unmatchedFolders` | Folders whose name has no `_ID` of any request |
| `withoutId` | Requests whose ID is not known yet (a Draft number before the upgrade) |

Source: [check script](../backend/scripts/check-attachment-folders.ts).

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

- `npm run test:attachments:postgres` (17 tests): `attachments.postgres.test.ts`
  runs `RequestsService`, the Attachment service and `AuditLogService` on
  in-memory PostgreSQL with a real temporary directory as
  `ATTACHMENT_STORAGE_PATH`, checks folder paths under Windows path rules
  (`Z:/attachment`, a `Z:/` drive root, a UNC share) and checks that the
  submission email queued with a real notification service carries the
  `PSF-` number, not the Draft number;
  `check-attachment-folders.test.ts` covers the folder check, before and after
  Request IDs. `initialize-data.postgres.test.ts` covers IDs and the sequence
  after a load; `request-attachments.controller.spec.ts` covers multipart upload
  with a Thai file name, the 413 limit, download headers and sign-in over HTTP.
- Frontend tests cover tab order, Draft placement, the default
  Product_Description, staged upload and its failure, batches of 10 with a
  retry of only the files not uploaded, preview versus direct download, delete
  confirmation and Audit History labels.
- A manual run of the built backend on a disposable PostgreSQL 16 with the Vite
  frontend in Chromium exercised New Request with staged files, the folder
  rename, submission to `PSF-000002`, the Attachments tab, preview, deletion and
  Audit History; `npm run attachments:check` was run against a disposable
  PostgreSQL 16 with Thai folder names. The configured database, a Windows
  server and a real NAS share were not used, so the "in use on the NAS" refusal
  is untested.
