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
          fieldKey: 'due_date',
          canonicalKey: 'due_date',
          label: 'Due Date',
          type: 'date',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'priority',
          canonicalKey: 'priority',
          label: 'Priority',
          type: 'select',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'probecard_name',
          canonicalKey: 'probecard_name',
          label: 'Probecard Name',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'reference_psf_name',
          canonicalKey: 'reference_psf_name',
          label: 'Reference PSF Name',
          type: 'text',
          required: false,
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
      due_date: '2026-07-01',
      priority: 'High',
      probecard_name: 'PC-123',
      reference_psf_name: 'REF-PSF',
      internal_only: 'ignored',
      legacy_unmapped: 'ignored',
    });

    expect(canonicalValues).toEqual({
      title: 'Probe card setup',
      requester: 'Fook',
      due_date: '2026-07-01',
      priority: 'High',
      probecard_name: 'PC-123',
      reference_psf_name: 'REF-PSF',
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
      due_date: null,
      priority: null,
      probecard_name: null,
      reference_psf_name: null,
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
          { canonicalKey: 'due_date', value: null },
          { canonicalKey: 'priority', value: null },
          { canonicalKey: 'probecard_name', value: null },
          { canonicalKey: 'reference_psf_name', value: null },
        ]),
      ],
    );
  });

  it('persists the submitted request search index from canonical values and request metadata', async () => {
    await service.upsertRequestSearchIndex(
      {
        requestId: 'request-1',
        requestNo: 'DRAFT-1',
        status: 'Submitted',
        requester: 'Fook',
        requesterUserId: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
        setupOwner: null,
        setupOwnerRole: 'GNTC',
        productType: 'New Product',
        requestDate: new Date('2026-06-18T01:02:03.000Z'),
        updatedAt: new Date('2026-06-18T01:05:03.000Z'),
      },
      {
        title: 'Probe card setup',
        reference_psf_name: 'REF-PSF',
        psf_setup_file_name: 'SETUP-PSF',
        probecard_name: 'PC-123',
        priority: 'High',
        due_date: '2026-07-01',
      },
    );

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO psf_request_search_index'),
      [
        'request-1',
        'DRAFT-1',
        'Probe card setup',
        'REF-PSF',
        'SETUP-PSF',
        'PC-123',
        'Submitted',
        'High',
        'Fook',
        '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
        null,
        'GNTC',
        'New Product',
        '2026-06-18T01:02:03.000Z',
        '2026-07-01',
        '2026-06-18T01:05:03.000Z',
      ],
    );
  });

  it('queries the request search index with keyword, dashboard filters, dates, and pagination', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          request_id: 'request-1',
          request_no: 'DRAFT-1',
          title: 'Probe card setup',
          reference_psf_name: 'REF-PSF',
          psf_setup_file_name: null,
          probecard_name: 'PC-123',
          status: 'Submitted',
          priority: 'High',
          requester: 'Fook',
          setup_owner: null,
          setup_owner_role: 'GNTC',
          product_type: 'New Product',
          request_date: new Date('2026-06-18T01:02:03.000Z'),
          due_date: new Date('2026-07-01T00:00:00.000Z'),
          updated_at: new Date('2026-06-18T01:05:03.000Z'),
          total_count: 1,
        },
      ],
    });

    await expect(
      service.queryRequests({
        keyword: 'probe',
        status: 'Submitted',
        priority: 'High',
        setupOwnerRole: 'GNTC',
        productType: 'New Product',
        dueDateFrom: '2026-07-01',
        dueDateTo: '2026-07-31',
        limit: 10,
        offset: 20,
      }),
    ).resolves.toEqual({
      items: [
        {
          requestId: 'request-1',
          requestNo: 'DRAFT-1',
          title: 'Probe card setup',
          referencePsfName: 'REF-PSF',
          psfSetupFileName: null,
          probecardName: 'PC-123',
          status: 'Submitted',
          priority: 'High',
          requester: 'Fook',
          setupOwner: null,
          setupOwnerRole: 'GNTC',
          productType: 'New Product',
          requestDate: '2026-06-18T01:02:03.000Z',
          dueDate: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-06-18T01:05:03.000Z',
        },
      ],
      total: 1,
      limit: 10,
      offset: 20,
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM psf_request_search_index'),
      [
        'Submitted',
        'High',
        'GNTC',
        'New Product',
        '2026-07-01',
        '2026-07-31',
        '%probe%',
        10,
        20,
      ],
    );
  });

  it('preserves request-list filters for an internal synchronous export-sized query', async () => {
    await service.queryRequests(
      {
        status: 'Submitted',
        requestDateFrom: '2026-06-01',
        requestDateTo: '2026-06-30',
        limit: 2000,
      },
      2000,
    );

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM psf_request_search_index'),
      ['Submitted', '2026-06-01', '2026-06-30', 2000, 0],
    );
  });

  it('enforces requester ownership in one bulk export query regardless of a caller requester filter', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          request_id: 'request-1',
          request_no: 'PSF-0001',
          status: 'Submitted',
          requester: 'Requester Demo',
          setup_owner: 'Setup Owner Demo',
          setup_owner_role: 'GNTC',
          product_type: 'New Product',
          request_date: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:05:03.000Z'),
          requester_data_json: { legacy_title: 'Legacy title' },
          psf_created_data_json: { psf_setup_file_name: 'final.psf' },
          schema_snapshot_json: {
            formKey: 'psf-request',
            version: 1,
            title: 'PSF Request Form',
            sections: [],
          },
          canonical_values_json: { title: 'Current title' },
          total_count: 1,
        },
      ],
    });
    const actor = {
      id: 'requester-1',
      role: 'requester' as const,
    };
    const exportQueryService = service as unknown as {
      queryExportRequests: (
        filters: {
          status?: string;
          requesterUserId?: string;
          limit?: number;
          offset?: number;
        },
        actor: { id: string; role: 'requester' },
        maximumLimit?: number,
      ) => Promise<{
        items: Array<{
          requestId: string;
          canonicalValues: Record<string, unknown> | null;
        }>;
        total: number;
        limit: number;
        offset: number;
      }>;
    };

    await expect(
      exportQueryService.queryExportRequests(
        {
          status: 'Submitted',
          requesterUserId: 'foreign-requester-id',
          limit: 2000,
          offset: 0,
        },
        actor,
        2000,
      ),
    ).resolves.toMatchObject({
      items: [
        {
          requestId: 'request-1',
          canonicalValues: { title: 'Current title' },
        },
      ],
      total: 1,
      limit: 2000,
      offset: 0,
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM psf_requests'),
      ['Submitted', actor.id, 2000, 0],
    );
    const [query] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('canonical_submission_values');
    expect(query).toContain('requester_data_json');
    expect(query).toContain('schema_snapshot_json');
    expect(query).toContain('requester_user_id = $2');
  });

  it('does not apply requester ownership scoping to an admin export query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const adminActor = {
      id: 'admin-1',
      role: 'admin' as const,
    };

    await service.queryExportRequests(
      { status: 'Submitted', limit: 2000, offset: 0 },
      adminActor,
      2000,
    );

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
      'Submitted',
      2000,
      0,
    ]);
    const [query] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(query).not.toContain('requester_user_id = $');
  });

  it.each([
    [['North, East', ' South '], 'North, East, South'],
    [[], ''],
    [null, ''],
    ['  scalar  ', 'scalar'],
    [42, '42'],
    [false, 'false'],
    [{ unexpected: true }, ''],
  ])(
    'serializes canonical value %p deterministically as %p',
    (value, expected) => {
      const canonicalSerializer = service as unknown as {
        serializeCanonicalValue: (value: unknown) => string;
      };

      expect(canonicalSerializer.serializeCanonicalValue(value)).toBe(expected);
    },
  );
});
