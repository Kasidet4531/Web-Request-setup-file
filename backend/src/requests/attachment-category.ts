/**
 * Attachment Categories (ADR 0022): worked out from the file name whenever an
 * Attachment is shown, so nothing is chosen on upload, nothing moves on the
 * NAS and Imported Requests are grouped at once. These lists are the only
 * copy of the rule; changing them is a code change (plan Q23).
 */
export type AttachmentCategory = 'map_layout' | 'fpc_layout' | 'other';

/** Wafer map layouts, E142 files included. */
const MAP_LAYOUT_EXTENSIONS = ['.xml', '.dpl', '.lay', '.tpl', '.mdf'];
const FPC_LAYOUT_PREFIX = 'pcsf';
const FPC_LAYOUT_EXTENSIONS = ['.xls', '.xlsx', '.xlsm'];

/**
 * Map Layout File for a name ending in a map layout extension; FPC Layout
 * File for an Excel workbook whose name starts with PCSF; Other for every
 * other file. Letter case is ignored.
 */
export function attachmentCategory(filename: string): AttachmentCategory {
  const name = filename.toLowerCase();
  const endsWithAny = (extensions: string[]) =>
    extensions.some((extension) => name.endsWith(extension));
  if (endsWithAny(MAP_LAYOUT_EXTENSIONS)) return 'map_layout';
  if (name.startsWith(FPC_LAYOUT_PREFIX) && endsWithAny(FPC_LAYOUT_EXTENSIONS))
    return 'fpc_layout';
  return 'other';
}
