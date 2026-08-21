import { Pool } from 'pg';
import { ExportJobRepository } from './export-job.repository';

const actor = {
  id: 'requester-1',
  role: 'requester' as const,
};

const queuedRow = {
  id: '2b8b2f0b-5ea4-4d2b-8a20-9f99276dfa49',
  owner_user_id: actor.id,
  owner_role: actor.role,
  filters_json: {
    status: 'Submitted',
    requestDateFrom: '2026-06-01',
    requestDateTo: '2026-06-30',
  },
  status: 'queued',
  attempt_count: 0,
  queued_at: new Date('2026-08-20T00:00:00.000Z'),
  started_at: null,
  claimed_at: null,
  completed_at: null,
  failed_at: null,
  filename: null,
  content: null,
  failure_message: null,
  claim_token: null,
};

describe('ExportJobRepository', () => {
  let pool: { query: jest.Mock };
  let repository: ExportJobRepository;

  beforeEach(() => {
    pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    repository = new ExportJobRepository(pool as unknown as Pool);
  });

  it('self-provisions durable PostgreSQL storage for queued, running, completed, and failed export jobs', async () => {
    await repository.onModuleInit();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS psf_export_jobs'),
    );
    const queryCalls = pool.query.mock.calls as unknown as Array<
      [string, unknown[]?]
    >;
    const [schemaQuery] = queryCalls[0] ?? [];

    if (!schemaQuery) {
      throw new Error('Expected an export-job schema query.');
    }

    expect(schemaQuery).toContain(
      "CHECK (status IN ('queued', 'running', 'completed', 'failed'))",
    );
    expect(schemaQuery).toContain('content BYTEA');
    expect(schemaQuery).toContain('owner_user_id UUID NOT NULL');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('idx_psf_export_jobs_queued'),
    );
  });

  it('persists immutable filters and the actor scope when enqueuing a durable job', async () => {
    pool.query.mockResolvedValueOnce({ rows: [queuedRow] });

    await expect(
      repository.enqueue(
        {
          status: 'Submitted',
          requestDateFrom: '2026-06-01',
          requestDateTo: '2026-06-30',
        },
        actor,
      ),
    ).resolves.toMatchObject({
      id: queuedRow.id,
      ownerUserId: actor.id,
      ownerRole: 'requester',
      filters: queuedRow.filters_json,
      status: 'queued',
      queuedAt: '2026-08-20T00:00:00.000Z',
      content: null,
    });

    const [query, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('INSERT INTO psf_export_jobs');
    expect(values).toEqual([
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
      actor.id,
      actor.role,
      JSON.stringify(queuedRow.filters_json),
    ]);
  });

  it('recovers stale work and claims no more than one queued row through an atomic SKIP LOCKED update', async () => {
    const runningRow = {
      ...queuedRow,
      status: 'running',
      attempt_count: 1,
      started_at: new Date('2026-08-20T00:02:00.000Z'),
      claimed_at: new Date('2026-08-20T00:02:00.000Z'),
      claim_token: '4d793b59-03e7-4c21-bb79-4e4db810ea5a',
    };
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [runningRow] });

    const job = await repository.claimNext(
      new Date('2026-08-20T00:01:00.000Z'),
      2,
    );

    expect(job).toMatchObject({
      id: queuedRow.id,
      status: 'running',
      attemptCount: 1,
      claimToken: runningRow.claim_token,
    });
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SET status = 'queued'"),
      [new Date('2026-08-20T00:01:00.000Z'), 2],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SET status = 'failed'"),
      [
        new Date('2026-08-20T00:01:00.000Z'),
        'Export processing did not finish. Please start a new export.',
        2,
      ],
    );
    const [claimQuery] = pool.query.mock.calls[2] as [string, unknown[]];
    expect(claimQuery).toContain('FOR UPDATE SKIP LOCKED');
    expect(claimQuery).toContain("SET status = 'running'");
    expect(claimQuery).toContain('attempt_count = job.attempt_count + 1');
  });

  it('renews only an active claim so long-running work is not reclaimed as stale', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await expect(
      repository.refreshClaim(
        queuedRow.id,
        '4d793b59-03e7-4c21-bb79-4e4db810ea5a',
      ),
    ).resolves.toBe(true);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET claimed_at = NOW()'),
      [queuedRow.id, '4d793b59-03e7-4c21-bb79-4e4db810ea5a'],
    );
    const [query] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain("status = 'running'");
    expect(query).toContain('claim_token = $2::uuid');
  });

  it('uses the current owner on status lookup and requires the active claim token to persist results', async () => {
    const completedRow = {
      ...queuedRow,
      status: 'completed',
      completed_at: new Date('2026-08-20T00:03:00.000Z'),
      filename: 'psf_requests_20260820_070300.xlsx',
      content: Buffer.from('xlsx'),
    };
    pool.query
      .mockResolvedValueOnce({ rows: [queuedRow] })
      .mockResolvedValueOnce({ rows: [completedRow] })
      .mockResolvedValue({ rows: [] });

    await expect(
      repository.findOwned(queuedRow.id, actor.id),
    ).resolves.toMatchObject({
      id: queuedRow.id,
      content: null,
    });
    const [statusQuery, statusValues] = pool.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(statusQuery).toContain(
      'WHERE id = $1::uuid AND owner_user_id = $2::uuid',
    );
    expect(statusQuery).not.toContain('content');
    expect(statusValues).toEqual([queuedRow.id, actor.id]);

    await expect(
      repository.findOwnedContent(queuedRow.id, actor.id),
    ).resolves.toMatchObject({
      status: 'completed',
      filename: completedRow.filename,
      content: Buffer.from('xlsx'),
    });

    await repository.complete(
      queuedRow.id,
      '4d793b59-03e7-4c21-bb79-4e4db810ea5a',
      {
        content: Buffer.from('xlsx'),
        filename: completedRow.filename,
      },
    );
    await repository.fail(
      queuedRow.id,
      '4d793b59-03e7-4c21-bb79-4e4db810ea5a',
      'Unable to prepare this export. Please try again.',
    );

    const [completeQuery, completeValues] = pool.query.mock.calls[2] as [
      string,
      unknown[],
    ];
    expect(completeQuery).toContain("SET status = 'completed'");
    expect(completeQuery).toContain('claim_token = $2::uuid');
    expect(completeValues).toEqual([
      queuedRow.id,
      '4d793b59-03e7-4c21-bb79-4e4db810ea5a',
      completedRow.filename,
      Buffer.from('xlsx'),
    ]);

    const [failQuery, failValues] = pool.query.mock.calls[3] as [
      string,
      unknown[],
    ];
    expect(failQuery).toContain("SET status = 'failed'");
    expect(failQuery).toContain('claim_token = $2::uuid');
    expect(failValues).toEqual([
      queuedRow.id,
      '4d793b59-03e7-4c21-bb79-4e4db810ea5a',
      'Unable to prepare this export. Please try again.',
    ]);
  });
});
