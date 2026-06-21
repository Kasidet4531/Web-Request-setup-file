import { FormSchemaJson } from '../admin/form_schema.service';
import { SearchIndexService } from './search-index.service';

const schema: FormSchemaJson = {
  formKey: 'psf-request',
  version: 7,
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester'],
      fields: [
        {
          fieldKey: 'title_v2',
          canonicalKey: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'requester_name',
          canonicalKey: 'requester',
          label: 'Requester Name',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'internal_only',
          canonicalKey: 'internal_only',
          label: 'Internal Only',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'legacy_unmapped',
          canonicalKey: '',
          label: 'Legacy Unmapped',
          type: 'text',
          required: false,
          searchable: true,
        },
      ],
    },
  ],
};

describe('SearchIndexService canonical extraction', () => {
  let pool: { query: jest.Mock };
  let service: SearchIndexService;

  beforeEach(() => {
    pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    service = new SearchIndexService(pool as never);
  });

  it('extracts canonical values for searchable/exportable requester fields independently of rendering labels', () => {
    const canonicalValues = service.extractCanonicalValues(schema, {
      title_v2: '  Probe card setup  ',
      requester_name: 'Fook',
      internal_only: 'ignored',
      legacy_unmapped: 'ignored',
    });

    expect(canonicalValues).toEqual({
      title: 'Probe card setup',
      requester: 'Fook',
    });
  });

  it('sets missing or blank mapped canonical keys to null and ignores unmapped fields consistently', () => {
    const canonicalValues = service.extractCanonicalValues(schema, {
      title_v2: '   ',
      legacy_unmapped: 'ignored',
    });

    expect(canonicalValues).toEqual({
      title: null,
      requester: null,
    });
  });

  it('persists one upserted canonical row per extracted key for a submitted request', async () => {
    await service.upsertSubmittedCanonicalValues('request-1', schema, {
      title_v2: 'Probe card setup',
      requester_name: 'Fook',
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO canonical_submission_values'),
      [
        'request-1',
        JSON.stringify([
          { canonicalKey: 'title', value: 'Probe card setup' },
          { canonicalKey: 'requester', value: 'Fook' },
        ]),
      ],
    );
  });
});
