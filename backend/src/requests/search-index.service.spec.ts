import { FormSchemaJson } from '../admin/form_schema.service';
import { LEGACY_PSF_CREATED_INFORMATION_SCHEMA } from '../admin/form_schema.constants';
import { SearchIndexService } from './search-index.service';

const schema: FormSchemaJson = {
  formKey: 'psf-request',
  version: 7,
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
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
        null,
        'New Product',
        '2026-06-18T01:02:03.000Z',
        '2026-07-01',
        '2026-06-18T01:05:03.000Z',
        null,
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
          requester_user_id: 'requester-1',
          setup_owner: null,
          setup_owner_role: 'GNTC',
          product_type: 'New Product',
          request_date: new Date('2026-06-18T01:02:03.000Z'),
          due_date: new Date('2026-07-01T00:00:00.000Z'),
          updated_at: new Date('2026-06-18T01:05:03.000Z'),
          total_count: 1,
          open_count: 3,
          overdue_count: 1,
          completed_count: 2,
        },
      ],
    });

    await expect(
      service.queryRequests({
        keyword: 'probe',
        status: 'Submitted',
        priority: 'High',
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
          requesterUserId: 'requester-1',
          productType: 'New Product',
          requestDate: '2026-06-18T01:02:03.000Z',
          dueDate: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-06-18T01:05:03.000Z',
        },
      ],
      total: 1,
      summary: { open: 3, overdue: 1, completed: 2 },
      limit: 10,
      offset: 20,
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM psf_request_search_index'),
      [
        'Submitted',
        'High',
        'New Product',
        '2026-07-01',
        '2026-07-31',
        '%probe%',
        [],
        [],
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
      ['Submitted', '2026-06-01', '2026-06-30', [], [], 2000, 0],
    );
  });

  it('exports every non-Draft request to a requester in one bulk query regardless of a caller requester filter', async () => {
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
          psf_created_schema_snapshot_json: null,
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
          psfCreatedInformationSchema: FormSchemaJson;
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
          psfCreatedInformationSchema: LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
        },
      ],
      total: 1,
      limit: 2000,
      offset: 0,
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM psf_requests'),
      ['Submitted', 2000, 0],
    );
    const [query] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('canonical_submission_values');
    expect(query).toContain('requester_data_json');
    expect(query).toContain('schema_snapshot_json');
    expect(query).toContain('psf_created_schema_snapshot_json');
    expect(query).not.toContain('AND request.requester_user_id =');
    expect(query).toContain("WHERE request.status <> 'Draft'");
    expect(query).not.toContain('OR request.requester_user_id');
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

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE request.status <> 'Draft'"),
      ['Submitted', 2000, 0],
    );
    const [query] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(query).not.toContain('AND request.requester_user_id =');
    expect(query).not.toContain('OR request.requester_user_id');
  });

  it('returns the stored PSF Created Information descriptor in each export record', async () => {
    const storedSchema: FormSchemaJson = {
      formKey: 'psf-created-information',
      version: 5,
      title: 'Historical PSF Created Information',
      sections: [
        {
          sectionKey: 'historic',
          title: 'Historic fields',
          fields: [
            {
              fieldKey: 'legacy_setup_name',
              canonicalKey: 'setup_name',
              label: 'Legacy Setup Name',
              type: 'text',
              required: false,
            },
          ],
        },
      ],
    };
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          request_id: 'request-1',
          request_no: 'PSF-0001',
          status: 'PSF Created',
          requester: 'Requester Demo',
          setup_owner: 'Setup Owner Demo',
          setup_owner_role: 'GNTC',
          product_type: 'New Product',
          request_date: new Date('2026-06-18T01:02:03.000Z'),
          updated_at: new Date('2026-06-18T01:05:03.000Z'),
          requester_data_json: {},
          psf_created_data_json: { legacy_setup_name: 'old.psf' },
          psf_created_schema_snapshot_json: storedSchema,
          schema_snapshot_json: schema,
          canonical_values_json: null,
          total_count: 1,
        },
      ],
    });

    const result = await service.queryExportRequests(
      {},
      { id: 'admin-1', role: 'admin' },
    );

    expect(result.items[0]).toMatchObject({
      psfCreatedData: { legacy_setup_name: 'old.psf' },
      psfCreatedInformationSchema: storedSchema,
    });
  });

  it('counts an export through the same status and date scope without loading rows', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ total: 2001 }] });
    await expect(
      service.countExportRequests({
        status: 'Submitted',
        requestDateFrom: '2026-06-01',
        requestDateTo: '2026-06-30',
      }),
    ).resolves.toBe(2001);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT COUNT(*)::int AS total'),
      ['Submitted', '2026-06-01', '2026-06-30'],
    );
    const [query] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('FROM psf_requests AS request');
    expect(query).not.toContain('AND request.requester_user_id =');
    expect(query).toContain("WHERE request.status <> 'Draft'");
    expect(query).not.toContain('OR request.requester_user_id');
    expect(query).not.toContain('LIMIT');
  });

  it.each(['all', 'open', 'overdue', 'completed'] as const)(
    'keeps summary cards independent of %s work-state and pagination on an empty page',
    async (workState) => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            request_id: null,
            total_count: workState === 'all' ? 450 : 80,
            open_count: 370,
            overdue_count: 20,
            completed_count: 80,
          },
        ],
      });
      const result = await service.queryRequests(
        {
          status: 'Renamed finished',
          priority: 'High',
          requestDateFrom: '2026-09-01',
          requestDateTo: '2026-09-30',
          dueDateFrom: '2026-09-15',
          dueDateTo: '2026-10-01',
          limit: 10,
          offset: 1000,
        },
        {
          scope: 'all',
          relation: 'all',
          workState,
          actorId: 'admin-1',
          actorRole: 'admin',
          department: null,
          openStatuses: ['Renamed open'],
          completedStatuses: ['Renamed finished'],
        },
      );
      expect(result.items).toEqual([]);
      expect(result.total).toBe(workState === 'all' ? 450 : 80);
      expect(result.summary).toEqual({ open: 370, overdue: 20, completed: 80 });
      const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual([
        'Renamed finished',
        'High',
        '2026-09-01',
        '2026-09-30',
        '2026-09-15',
        '2026-10-01',
        ['Renamed open'],
        ['Renamed finished'],
        10,
        1000,
      ]);
      expect(sql).toContain("request_date < ($4::date + INTERVAL '1 day')");
      expect(sql).toContain("due_date < ($6::date + INTERVAL '1 day')");
      expect(sql).toContain(
        'COUNT(*) FILTER (WHERE status = ANY($7::text[]))::int AS open_count',
      );
      expect(sql).toContain(
        "COUNT(*) FILTER (WHERE status = ANY($7::text[]) AND due_date IS NOT NULL AND due_date::date < (NOW() AT TIME ZONE 'Asia/Bangkok')::date)::int AS overdue_count",
      );
      expect(sql).toContain(
        'COUNT(*) FILTER (WHERE status = ANY($8::text[]))::int AS completed_count',
      );
      expect(sql).not.toContain("status = 'Completed'");
      expect(sql).toContain(
        'totals AS (SELECT COUNT(*)::int AS total_count FROM visible)',
      );
      expect(sql).toContain('FROM totals CROSS JOIN summary');
    },
  );

  it.each(['requester', 'admin'] as const)(
    'restricts %s related all work to creator ID even when ordinary filters name another user',
    async (actorRole) => {
      await service.queryRequests(
        { requester: 'Foreign Name', requesterUserId: 'filter-only-id' },
        {
          scope: 'related',
          relation: 'all',
          workState: 'all',
          actorId: 'server-actor',
          actorRole,
          department: null,
          openStatuses: ['Open'],
          completedStatuses: ['Done'],
        },
      );
      const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual([
        'Foreign Name',
        'filter-only-id',
        'server-actor',
        ['Open'],
        ['Done'],
        50,
        0,
      ]);
      expect(sql).toContain('requester_user_id = $3::uuid');
      expect(sql).not.toContain(' OR setup_owner_role');
    },
  );

  it('reads own private Drafts exclusively from request storage with actor-bound pagination totals', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: null, schema_snapshot_json: null, total_count: 2 }],
    });
    await expect(
      service.queryOwnDrafts('server-actor', {
        keyword: 'own',
        requesterUserId: 'foreign-id',
        limit: 5,
        offset: 10,
      }),
    ).resolves.toEqual({
      items: [],
      total: 2,
      limit: 5,
      offset: 10,
      summary: { open: 0, overdue: 0, completed: 0 },
    });
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['server-actor', '%own%', 5, 10]);
    expect(sql).toContain(
      "FROM psf_requests WHERE status = 'Draft' AND requester_user_id = $1::uuid",
    );
    expect(sql).not.toContain('psf_request_search_index');
    expect(sql).not.toContain('foreign-id');
    expect(sql).toContain('totals LEFT JOIN page ON TRUE');
    expect(sql).toContain('SS.US');
  });

  it.each([
    { priority: '  Urgent  ' },
    { dueDateFrom: '2026-10-01' },
    { dueDateTo: '2026-10-02' },
  ])(
    'applies the accepted private Draft filter %p in the owner-bound SQL before totals and paging',
    async (filters) => {
      await service.queryOwnDrafts('server-actor', filters);
      const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual([
        'server-actor',
        (Object.values(filters)[0] as string).trim(),
        50,
        0,
      ]);
      const filtered = sql.split('totals AS')[0];
      expect(filtered).toContain(
        "status = 'Draft' AND requester_user_id = $1::uuid",
      );
      if ('setupOwnerRole' in filters) {
        expect(filtered).toContain('LOWER(setup_owner_role) = LOWER($2)');
      } else {
        const canonicalKey = 'priority' in filters ? 'priority' : 'due_date';
        expect(filtered).toContain(
          "jsonb_array_elements(schema_snapshot_json->'sections')",
        );
        expect(filtered).toContain(
          "jsonb_array_elements(section.value->'fields')",
        );
        expect(filtered).toContain(
          `field.value->>'canonicalKey' = '${canonicalKey}'`,
        );
        expect(filtered).toContain('requester_data_json ->> (');
        expect(filtered).toContain("SELECT field.value->>'fieldKey'");
        expect(filtered).toContain("field.value->'searchable' = 'true'::jsonb");
        expect(filtered).toContain("field.value->'exportable' = 'true'::jsonb");
        expect(filtered).toContain(
          "field.value->'autofillTrigger' = 'true'::jsonb",
        );
        expect(filtered).toContain(
          'ORDER BY section.position DESC, field.position DESC LIMIT 1',
        );
        expect(filtered).toContain('NULLIF(REGEXP_REPLACE(');
        expect(filtered).toContain("'^[[:space:]]+|[[:space:]]+$', '', 'g'");
        expect(filtered).not.toContain(
          `requester_data_json ->> '${canonicalKey}'`,
        );
        expect(filtered).toContain(
          'priority' in filters
            ? '= LOWER($2)'
            : 'dueDateFrom' in filters
              ? '>= $2::date'
              : "< ($2::date + INTERVAL '1 day')",
        );
      }
      expect(sql).toContain(
        'totals AS (SELECT COUNT(*)::int AS total_count FROM filtered)',
      );
      expect(sql).toContain(
        'FROM filtered ORDER BY updated_at DESC, request_no DESC',
      );
      expect(sql).toContain('LIMIT $3 OFFSET $4');
      expect(sql).not.toContain('psf_request_search_index');
      expect(sql).not.toContain('canonical_submission_values');
    },
  );

  it('combines all private Draft filters against captured canonical keys with stable parameter positions and out-of-range totals', async () => {
    const captured: FormSchemaJson = {
      ...schema,
      version: 2,
      sections: [
        {
          sectionKey: 'historical',
          title: 'Old labels',
          fields: [
            {
              fieldKey: 'urgency_legacy_42',
              canonicalKey: 'priority',
              label: 'Old urgency',
              type: 'select',
              required: false,
              searchable: true,
            },
            {
              fieldKey: 'deadline_legacy_7',
              canonicalKey: 'due_date',
              label: 'Old deadline',
              type: 'date',
              required: false,
              exportable: true,
            },
          ],
        },
      ],
    };
    const data = {
      urgency_legacy_42: ' Urgent ',
      deadline_legacy_7: '2026-10-02',
      priority: 'Low',
      due_date: '2030-01-01',
    };
    expect(service.extractCanonicalValues(captured, data)).toEqual({
      priority: 'Urgent',
      due_date: '2026-10-02',
    });
    expect(
      service.extractCanonicalValues({ ...captured, sections: [] }, data),
    ).toEqual({});
    expect(
      service.extractCanonicalValues(captured, {
        urgency_legacy_42: ' ',
        deadline_legacy_7: '',
      }),
    ).toEqual({ priority: null, due_date: null });
    pool.query.mockResolvedValueOnce({
      rows: [{ id: null, schema_snapshot_json: null, total_count: 2 }],
    });
    const result = await service.queryOwnDrafts('server-actor', {
      requesterUserId: 'foreign-id',
      requester: ' Owner ',
      priority: ' Urgent ',
      productType: ' Product ',
      requestDateFrom: '2026-09-01',
      requestDateTo: '2026-09-30',
      dueDateFrom: '2026-10-01',
      dueDateTo: '2026-10-02',
      keyword: ' legacy ',
      status: 'Draft',
      limit: 1,
      offset: 900,
    });
    expect(result).toEqual({
      items: [],
      total: 2,
      limit: 1,
      offset: 900,
      summary: { open: 0, overdue: 0, completed: 0 },
    });
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([
      'server-actor',
      'Owner',
      'Urgent',
      'Product',
      '2026-09-01',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '%legacy%',
      1,
      900,
    ]);
    expect(sql).toContain(
      "FROM psf_requests WHERE status = 'Draft' AND requester_user_id = $1::uuid",
    );
    expect(sql).toContain('>= $7::date');
    expect(sql).toContain("< ($8::date + INTERVAL '1 day')");
    expect(sql).toContain('LIMIT $10 OFFSET $11');
    expect(sql).toContain('totals LEFT JOIN page ON TRUE');
    expect(params).not.toContain('foreign-id');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 'Completed', release: null, visible: false },
    { status: 'PSF Created', release: null, visible: false },
    {
      status: 'Renamed release status',
      release: '2026-06-18T01:05:03.000001Z',
      visible: true,
    },
    {
      status: 'Submitted',
      release: '2026-06-18T01:05:03.000001Z',
      visible: true,
    },
  ])(
    'masks export PSF raw values using only sticky release: $status / $release',
    async ({ status, release, visible }) => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            request_id: 'request-1',
            request_no: 'PSF-1',
            status,
            requester: 'Owner',
            setup_owner: null,
            setup_owner_role: null,
            product_type: null,
            request_date: '2026-06-18T01:05:03Z',
            updated_at: '2026-06-18T01:05:03Z',
            requester_data_json: { title_v2: 'Visible requester title' },
            psf_created_data_json: { psf_setup_file_name: 'private.psf' },
            psf_released_at: release,
            psf_created_schema_snapshot_json:
              LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
            schema_snapshot_json: schema,
            canonical_values_json: { title: 'Visible requester title' },
            total_count: 1,
          },
        ],
      });
      const result = await service.queryExportRequests(
        {},
        { id: 'server-actor', role: 'requester' },
      );
      expect(result.items[0]).toMatchObject({
        psfReleasedAt: release,
        psfCreatedData: visible ? { psf_setup_file_name: 'private.psf' } : {},
        schemaSnapshot: schema,
        psfCreatedInformationSchema: LEGACY_PSF_CREATED_INFORMATION_SCHEMA,
        canonicalValues: { title: 'Visible requester title' },
      });
    },
  );

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
