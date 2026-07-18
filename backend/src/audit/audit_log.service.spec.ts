import { Pool } from 'pg';
import { AuditLogService } from './audit_log.service';

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
});
