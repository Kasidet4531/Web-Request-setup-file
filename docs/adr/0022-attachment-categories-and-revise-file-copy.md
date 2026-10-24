# 22. Attachment categories come from file names, and a Revise copies the referenced request's files

Status: accepted (24 October 2026, decided by Fook with the PSF team). Attachment Categories implemented in source on 24 October 2026 (issue #122; see [Request Attachments](../request-attachments.md#attachment-categories)); the Revise file copy is not yet implemented.

The review asked for typed upload slots (PSF, PCSF, E142, layout, focus card, other) and for a referred request's files to come along. Typed slots were too big for the time left, so an Attachment's category is worked out from its name whenever it is shown: a Map Layout File ends in .xml, .dpl, .lay, .tpl or .mdf (E142 files included), an FPC Layout File is an Excel file (.xls, .xlsx, .xlsm) whose name starts with PCSF, ignoring case, and every other file is Other. Files stay in the request's single NAS folder ([ADR 0018](0018-nas-folder-names-follow-the-sharepoint-export.md)).

Autofill now runs only when Request To is Revise from old PSF. Choosing it asks for the Reference PSF and a Revise Change Type. When the Draft is saved after Autofill, the system copies the Reference PSF's Attachments once: Change Map layout copies all but Map Layout Files, Change FPC layout copies all but FPC Layout Files, and Any change copies everything. The Requester deletes what is not needed and answers for what is submitted. The "Product layout" form field is retired.

## Considered options

- **Typed upload slots chosen by the uploader.** Rejected for now as too large. Categories from names need no choice and apply to Imported Requests straight away.
- **A subfolder per category on the NAS.** Rejected: it breaks the folder rule of ADR 0018 and every existing folder.
- **Autofill for every Request To**, as today. Rejected: Create new PSF and Product Transfer requests are filled in from scratch.
- **Required files per Request To.** Deferred to phase 2 (plan item 8).

## Consequences

- The extension lists live in code, so changing them is a code change (plan Q23).
- Copying happens once: changing the Revise Change Type later neither copies nor removes files.
- The chosen Revise Change Type is stored with the request and shown on the request page and in the Excel export.
