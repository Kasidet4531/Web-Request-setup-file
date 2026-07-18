import { Pool } from 'pg';
import { AuditLogService } from './audit_log.service';

interface RequestAuditHistoryEntry {
  actionType: string;
  actorDisplayName: string;
  actorRole: 'requester' | 'setup_owner' | 'admin';
  createdAt: string;
  metadata: Record<string, unknown>;
}

type AuditLogServiceContract = {
  onModuleInit(): Promise<void>;
  record(
    event: {
      requestId: string;
      actionType: string;
      actor: {
        id: string;
        username: string;
        displayName: string;
        role: 'requester' | 'setup_owner' | 'admin';
        setupOwnerDepartment: 'GNTC' | 'MFG' | null;
      };
      metadata: Record<string, unknown>;
    },
    queryRunner?: { query: jest.Mock },
  ): Promise<void>;
  findByRequestId(requestId: string): Promise<RequestAuditHistoryEntry[]>;
};

describe('AuditLogService', () => {
  let pool: { query: jest.Mock };
  let service: AuditLogServiceContract;

  beforeEach(() => {
    pool = { query: jest.fn().mockResolvedValue(undefined) };
    service = new AuditLogService(pool as unknown as Pool);
  });

  it('creates the baseline request audit storage and request-time index', async () => {
    await service.onModuleInit();

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS psf_request_audit_logs',
      ),
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('actor_id UUID NOT NULL'),
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('metadata_json JSONB NOT NULL'),
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'CREATE INDEX IF NOT EXISTS idx_psf_request_audit_logs_request_created_at',
      ),
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'ON psf_request_audit_logs (request_id, created_at DESC)',
      ),
    );
  });

  it('writes a request action with the trusted actor fields through the supplied transaction', async () => {
    const transaction = { query: jest.fn().mockResolvedValue(undefined) };

    await service.record(
      {
        requestId: 'c4e87bd1-f7de-4d6d-8097-bf914cd13acd',
        actionType: 'DRAFT_CREATED',
        actor: {
          id: '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
          username: 'requester.demo',
          displayName: 'Requester Demo',
          role: 'requester',
          setupOwnerDepartment: null,
        },
        metadata: {},
      },
      transaction,
    );

    expect(transaction.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO psf_request_audit_logs'),
      [
        expect.any(String),
        'c4e87bd1-f7de-4d6d-8097-bf914cd13acd',
        'DRAFT_CREATED',
        '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e',
        'requester.demo',
        'Requester Demo',
        'requester',
        {},
      ],
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns only one request history in deterministic chronological order with UI display fields', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          action_type: 'DRAFT_CREATED',
          actor_display_name: 'Requester Demo',
          actor_role: 'requester',
          created_at: new Date('2026-06-18T01:02:03.000Z'),
          metadata_json: {},
        },
        {
          action_type: 'REQUEST_STATUS_CHANGED',
          actor_display_name: 'Setup Owner GNTC Demo',
          actor_role: 'setup_owner',
          created_at: new Date('2026-06-18T01:06:03.000Z'),
          metadata_json: {
            fromStatus: 'Submitted',
            toStatus: 'Setup In Progress',
          },
        },
      ],
    });

    await expect(service.findByRequestId('request-1')).resolves.toEqual([
      {
        actionType: 'DRAFT_CREATED',
        actorDisplayName: 'Requester Demo',
        actorRole: 'requester',
        createdAt: '2026-06-18T01:02:03.000Z',
        metadata: {},
      },
      {
        actionType: 'REQUEST_STATUS_CHANGED',
        actorDisplayName: 'Setup Owner GNTC Demo',
        actorRole: 'setup_owner',
        createdAt: '2026-06-18T01:06:03.000Z',
        metadata: {
          fromStatus: 'Submitted',
          toStatus: 'Setup In Progress',
        },
      },
    ]);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM psf_request_audit_logs/),
      ['request-1'],
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE request_id = $1'),
      ['request-1'],
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at ASC, id ASC'),
      ['request-1'],
    );
  });
});
