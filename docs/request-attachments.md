# Request Attachments and request IDs

Implemented in source on 20 October 2026 for issue #78; the Attachment Policy
route and the picker limits were added on 21 October 2026 for issue #89, and
folder names were aligned with the SharePoint export the same day for issue
#97. Attachment Categories were added on 24 October 2026 for issue #122. Source
is authoritative; this guide describes the source as of those changes. It is
not deployment
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

Since 24 October 2026 (issue #112) New Request (`/requests/new`) starts its
`title` field (Target 12NC Desc, labelled Product_Description in the Initial
Data Load forms) blank, like every other field, so the Requester types the real
name. A Draft saved without it uses the `_[ID]` folder below, and typing it
later renames the folder. Whether submission needs it is the captured form's
required flag. Before, the field started as `Product_Description`. Source:
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
held in memory up to that size. The pickers show this limit, read from the
[Attachment Policy](#access-and-api) route, so changing it and restarting the
backend changes the hint with no frontend change.

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
  `/ \ : * ? " < > |` and control characters replaced by `_`, cut to its first
  100 characters, then stripped of trailing dots and spaces. That is how the
  SharePoint export named the Imported Requests' folders, so `Tiger.` with ID
  703 is `Tiger_703`
  ([ADR 0018](adr/0018-nas-folder-names-follow-the-sharepoint-export.md)).
- Files keep their original names (any client path removed, characters Windows
  forbids replaced by `_`). A name already in the folder gets ` (1)`, ` (2)`…
  before its extension; nothing is overwritten.
- `.exe`, `.bat`, `.cmd`, `.com`, `.msi`, `.ps1`, `.sh` and `.vbs` files are
  refused, as are system files, which listings also ignore: those of Windows,
  macOS and Office (`Thumbs.db`, `desktop.ini`, `.DS_Store`, `~$…`) and the
  SharePoint export's `ItemInfo.txt` and `_export_complete.txt`, in any letter
  case. The export's files stay in the folder for Windows Explorer; the app
  does not read them. The extension list is
  defined only in the backend and served by the Attachment Policy route; the
  system files are not part of it.
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

## Attachment Categories

Every Attachment belongs to one **Attachment Category**, worked out from its
file name each time the list is read
([ADR 0022](adr/0022-attachment-categories-and-revise-file-copy.md)). Nobody
chooses it on upload and nothing is stored: files keep their names and stay in
the request's one folder, so the Imported Requests' existing files and files
placed on the NAS directly are grouped at once, with no migration.

Letter case is ignored:

| Category | `category` | Rule | Examples |
| --- | --- | --- | --- |
| Map Layout File | `map_layout` | The name ends in `.xml`, `.dpl`, `.lay`, `.tpl` or `.mdf` (E142 files included) | `E142_map.XML`, `wafer.dpl`, `PCSF_layout.xml` |
| FPC Layout File | `fpc_layout` | The name starts with `PCSF` and ends in `.xls`, `.xlsx` or `.xlsm` | `pcsf_ABC.xlsm`, `PCSF ABC.XLS` |
| Other | `other` | Every other file | `PCSF_ABC.csv`, `notes.xlsx`, `old_PCSF.xlsx`, `wafer.png` |

The Map Layout File test comes first, so `PCSF_layout.xml` is a Map Layout
File. The extension lists and the `PCSF` prefix are defined once, in
`attachmentCategory` in the backend, and each item of the Attachments response
carries its `category`, so every screen groups files by the same rule.
Changing the lists is a code change (plan Q23).

Source: [rule](../backend/src/requests/attachment-category.ts).

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
| `GET /api/requests/:requestId/attachments` → `{ folderName, canManage, items }`; each item has `id`, `filename`, `mimeType`, `sizeBytes`, `isImage`, `category`, `uploadedByDisplayName` and `createdAt` | Anyone who can see the request; Admin also on any Draft (read only) |
| `GET /api/requests/:requestId/attachments/:attachmentId/download` | Same as above |
| `POST /api/requests/:requestId/attachments` (multipart field `files`, up to 10) | The creator of a Draft; anyone signed in on a submitted request |
| `DELETE /api/requests/:requestId/attachments/:attachmentId` | Same as upload |
| `GET /api/attachment-policy` → `{ maxBytes, blockedExtensions }` | Anyone signed in, any role; 401 otherwise |

The **Attachment Policy** is what the upload path refuses: `maxBytes` is
`ATTACHMENT_MAX_BYTES` and `blockedExtensions` the blocked extensions in
lower case with their dot (`[".exe", ".bat", ".cmd", ".com", ".msi", ".ps1",
".sh", ".vbs"]`). Both come from the same storage configuration that uploads
are checked against. The route takes no request ID, because New Request shows
the policy before its Draft exists, and it reads configuration only: it
answers while `ATTACHMENT_STORAGE_PATH` is unset or the NAS is unreachable.
Upload batching (10 files per request) is not part of it; users never meet
that limit.

Attachments are shared across roles and teams. Uploads and deletions take
effect immediately: they need no form edit/save and do not change the request's
revision (`updatedAt`). Downloads are sent with `Content-Disposition:
attachment` and the exact UTF-8 name, `X-Content-Type-Options: nosniff` and a
sandboxing Content Security Policy.

Each upload records `ATTACHMENT_UPLOADED` and each deletion `ATTACHMENT_DELETED`
in Audit History, with `{ filename, sizeBytes, mimeType }`. These entries store
no Request Snapshot: they change no form content, and file bytes are never
stored in the database. Both actions are filterable on `/history`.

Source: [controller](../backend/src/requests/request-attachments.controller.ts),
[policy controller](../backend/src/requests/attachment-policy.controller.ts).

## Screens

- **Submitted Request Detail:** tabs `Requester Information` |
  `PSF Created Information` | `Attachments` | `History`.
- **Draft Detail and Admin Draft inspection:** the Attachments section sits
  directly below Requester Information.
- **Groups:** on submitted Request Detail, Draft Detail and Admin Draft
  inspection, the files are listed under Map Layout File, FPC Layout File and
  Other, in that order, each heading with its count, for example "Map Layout
  File (2)". Within a group files keep the list's order (oldest first). An
  empty group says so ("No Map Layout Files.", "No FPC Layout Files.", "No
  other files."), so a request with no files shows all three empty groups.
  The category is the one the server sends; one the screen does not know is
  shown under Other. Upload, download, preview and delete work in every group
  as before. New Request's files chosen before the first save are not
  grouped: they are not Attachments until uploaded.
- **New Request:** files chosen before the first save are listed as "Not
  uploaded yet" and uploaded right after the Draft is created; the page then
  opens the Draft. If the upload fails, the files stay listed with the error and
  a retry button. Staged files count as unsaved work when leaving the page.
- **Picker limits:** every picker that can add files (New Request's "Add
  files" and "Upload files" on a saved request) states the per-file limit,
  formatted like other file sizes, and the blocked file types beneath the
  Attachments heading, for example "Up to 50.0 MB per file · Not allowed:
  .exe, .bat, .cmd, .com, .msi, .ps1, .sh, .vbs"; the file input is described
  by that text. A read-only Attachments section shows no hint.
- **New Request refusals:** a chosen file that is larger than the limit
  ("`name` is larger than the 50.0 MB attachment limit.") or has a blocked
  type ("`name` cannot be attached: executable and script files are not
  allowed.") is refused at selection, and nothing from that selection is added.
  The type is read as the server reads it, from the last dot of the name once
  trailing dots and spaces are dropped, so `tool.exe.` is refused and a file
  named just `.sh` is not. Files chosen while the policy is still loading are
  staged, then checked when it arrives: any it rules out leave the list with
  the same messages. On a saved request files upload at once and the server's
  refusal is shown.
- **Without the policy:** if it cannot be loaded, both pickers still work with
  no hint and no client-side check; the server still refuses oversized and
  blocked files, so on New Request they fail after the Draft is saved, with
  the retry described above.
- Clicking an image (`png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `svg`) opens
  an Image Preview dialog with a Download button; clicking any other file
  downloads it. Deleting asks for confirmation.
- **Audit History** shows each request by its Product_Description (in the
  column headed Target 12NC Desc since 24 October 2026), or
  `Untitled Draft (#ID)` (`Untitled Request (#ID)` once submitted) while it is
  blank, with the `PSF-` number beneath it. Draft numbers are not shown.

Source: [panel](../frontend/src/components/RequestAttachmentsPanel.tsx),
[detail and New Request](../frontend/src/components/RequestsWorkspace.tsx),
[Audit History](../frontend/src/components/GlobalHistoryPage.tsx).

## Verification

24 October 2026, on the feature branch for issue #122:

- `attachment-category.spec.ts` (Jest) checks the rule against a table of
  names, including the ticket's examples (`E142_map.XML` Map,
  `pcsf_ABC.xlsm` FPC, `PCSF_ABC.csv` and `notes.xlsx` Other) and names that
  only look close (`old_PCSF.xlsx`, `map.xml.pdf`, `layout.dplx`).
- `npm run test:attachments:postgres` adds a test that the Attachments
  response gives every file its category, for uploaded files and for files
  written into the request folder directly, and that the folder's files keep
  their names.
- A frontend test checks the three groups, their order, counts and empty
  messages, and that files in a group still download and offer Delete.
- Not checked in a browser or against the NAS share.

21 October 2026, on the feature branch for issue #97:

- `npm run test:attachments:postgres` (20 tests) checks folder names against
  folders the SharePoint export created on the NAS, as listed in the issue (a
  trailing dot; titles cut at 100 characters), a cut that ends on a dot, and
  that `ItemInfo.txt` and `_export_complete.txt` are neither listed nor
  accepted for upload. The full backend Jest suite passed.
- `npm run attachments:check` was not re-run against the NAS share. Expected
  there: `renamed` 18 → 0, `matched` 5,029 → 5,047, `unmatchedFolders`
  unchanged at 58.

21 October 2026, on the feature branch for issue #89:

- `attachment-policy.controller.spec.ts` checks over HTTP that requester,
  Setup File Owner and Admin sessions get the configured limit (a non-default
  `ATTACHMENT_MAX_BYTES`) and the blocked extensions, and that a missing
  session or a deleted user gets 401; `app.e2e-spec.ts` checks the route is
  registered under `/api` on the full application module with no
  `ATTACHMENT_STORAGE_PATH`.
- Frontend tests check both pickers' hints from a non-default policy, the New
  Request refusal of an oversized file (a file of exactly the limit is
  accepted) and of a blocked type from the server's list, the fallback without
  the policy, and the client's request to `/api/attachment-policy`.
- In Chromium 141 against the built backend with `ATTACHMENT_MAX_BYTES=2097152`
  on a disposable PostgreSQL 16 cluster and a temporary attachment directory
  (not the configured database or a NAS share): the route answered 401 signed
  out and `{"maxBytes":2097152,...}` to requester, Setup File Owner and Admin;
  both pickers showed "Up to 2.0 MB per file · Not allowed: …" as their
  input's description; New Request refused a 3 MB file and a `.ps1` file at
  selection and staged a file of exactly 2 MB; a Draft upload still worked;
  the 390px page had no horizontal scroll. Screenshots:
  [New Request refusal, desktop/light](verification/assets/2026-10-21-attachment-policy/new-request-oversized-desktop-light.png),
  [Draft picker, desktop/light](verification/assets/2026-10-21-attachment-policy/draft-attachments-desktop-light.png),
  [New Request hint, phone/dark](verification/assets/2026-10-21-attachment-policy/new-request-hint-mobile-dark.png).
- After code review, on the review-fix branch: frontend tests check that files
  chosen while the policy is loading are staged and, once it arrives, the ones
  it rules out are removed with their refusals, and that the type is read like
  the server's `path.extname` (`build.JS. ` refused, `.js` accepted). These
  two were not re-checked in a browser.

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
