# 18. NAS folder names follow the SharePoint export

Status: accepted and implemented in source (21 October 2026, issue #97); see [Request Attachments](../request-attachments.md).

The Imported Requests' Attachment folders were created by the SharePoint export, which cut Product_Description to 100 characters and dropped a trailing dot before `_[ID]`; the folder check against the NAS reported in #97 found 18 such folders the app's `[Product_Description]_[ID]` rule missed (16 trailing dots, 2 cut names). Because the app derives a request's folder name rather than storing it, we made the rule follow the export for every request: Product_Description cut to its first 100 characters, then stripped of trailing dots and spaces. It is expected to find all 18 without renaming any folder or file on the NAS.

## Considered options

- **Rename the 18 folders by hand**, as the Attachments guide advised for a `renamed` finding. Rejected: manual and error-prone, and the next Product_Description ending in a dot or longer than 100 characters would raise the same mismatch.
- **Fall back to any folder ending in `_[ID]`** when the exact name is missing, as #97 first proposed. Rejected: every Attachment read would list some 5,000 folders on the share, a folder found this way would not be renamed when Product_Description changes, so the next upload would start a second folder, and two folders ending in the same ID would need a tie-break rule.

## Consequences

- The 100-character cap also keeps folder paths shorter for Windows Explorer.
- Folders are still renamed when Product_Description changes, Imported Requests included; the files inside keep their names.
- Changing this rule again would make the app miss existing folders, so it needs a migration or an `npm run attachments:check` run first.
