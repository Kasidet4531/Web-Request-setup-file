import { attachmentCategory } from './attachment-category';

describe('Attachment Category from the file name', () => {
  it.each([
    // Map Layout File: ends in .xml, .dpl, .lay, .tpl or .mdf, E142 files included.
    ['E142_map.XML', 'map_layout'],
    ['E142.xml', 'map_layout'],
    ['wafer.dpl', 'map_layout'],
    ['WAFER.DPL', 'map_layout'],
    ['job.lay', 'map_layout'],
    ['probe.Tpl', 'map_layout'],
    ['site.mdf', 'map_layout'],
    ['PCSF_layout.xml', 'map_layout'],
    ['ผังชิป.lay', 'map_layout'],
    // FPC Layout File: starts with PCSF and ends in .xls, .xlsx or .xlsm.
    ['pcsf_ABC.xlsm', 'fpc_layout'],
    ['PCSF_ABC.xlsx', 'fpc_layout'],
    ['PCSF ABC.XLS', 'fpc_layout'],
    ['Pcsf-TJA1044 rev2.xlsx', 'fpc_layout'],
    // Other: every other file.
    ['PCSF_ABC.csv', 'other'],
    ['PCSF_ABC.pdf', 'other'],
    ['notes.xlsx', 'other'],
    ['old_PCSF.xlsx', 'other'],
    ['map.xml.pdf', 'other'],
    ['layout.dplx', 'other'],
    ['wafer.png', 'other'],
    ['README', 'other'],
  ])('%s is %s', (filename, category) => {
    expect(attachmentCategory(filename)).toBe(category);
  });
});
