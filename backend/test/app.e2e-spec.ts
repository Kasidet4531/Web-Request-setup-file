import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import type { AuthenticatedRequest } from './../src/auth/session.types';
import {
  DATABASE_POOL,
  DatabaseService,
} from './../src/database/database.service';
import { ExcelExportService } from './../src/export/excel_export.service';
import { AutofillService } from './../src/requests/autofill.service';

interface HealthResponseBody {
  status: string;
  application: string;
  database: { status: string };
  timestamp: string;
}

interface FormDefinitionRow {
  form_key: string;
  version: number;
  title: string;
  description: string | null;
  status: string;
  schema_json: Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  published_at: Date | null;
}

type PoolQuery = (
  query: string,
  values?: unknown[],
) => Promise<{ rows: unknown[] }>;

const MANUAL_WORKFLOW_STATUSES = [
  'Submitted',
  'Setup In Progress',
  'Need More Information',
  'PSF Created',
  'Completed',
  'Rejected',
  'Cancelled',
];

function buildWorkflowConfiguration(
  ruleOverrides: (
    fromStatus: string,
    toStatus: string,
  ) => Partial<{
    enabled: boolean;
    allowedRoles: string[];
    allowedSetupOwnerDepartments: string[];
  }> = () => ({}),
) {
  return {
    transitions: MANUAL_WORKFLOW_STATUSES.flatMap((fromStatus) =>
      MANUAL_WORKFLOW_STATUSES.filter(
        (toStatus) => toStatus !== fromStatus,
      ).map((toStatus) => ({
        fromStatus,
        toStatus,
        enabled: true,
        allowedRoles: ['admin'],
        allowedSetupOwnerDepartments: [],
        ...ruleOverrides(fromStatus, toStatus),
      })),
    ),
  };
}

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let activeUserId: string | undefined;
  let workflowConfiguration: unknown;
  const authService = {
    getProfile: jest.fn(),
    listUsers: jest.fn(),
    updateUser: jest.fn(),
  };
  const excelExportService = { exportRequests: jest.fn() };
  const transactionClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const pool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue(transactionClient),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    workflowConfiguration = null;
    pool.query.mockImplementation((query: string, values?: unknown[]) => {
      if (query.includes('SELECT config_json')) {
        return Promise.resolve({
          rows:
            workflowConfiguration === null
              ? []
              : [{ config_json: workflowConfiguration }],
        });
      }

      if (query.includes('INSERT INTO workflow_transition_config')) {
        const nextConfiguration = values?.[1] ?? null;
        if (query.includes('DO NOTHING')) {
          workflowConfiguration ??= nextConfiguration;
        } else {
          workflowConfiguration = nextConfiguration;
        }

        return Promise.resolve({
          rows: query.includes('RETURNING')
            ? [{ config_json: workflowConfiguration }]
            : [],
        });
      }

      return Promise.resolve({ rows: [] });
    });
    pool.connect.mockResolvedValue(transactionClient);
    transactionClient.query.mockImplementation(
      (query: string, values?: unknown[]) => {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) {
          return Promise.resolve({});
        }

        const result: unknown = pool.query(query, values);
        return result;
      },
    );
    activeUserId = 'admin-1';
    authService.getProfile.mockResolvedValue({
      id: 'admin-1',
      username: 'admin.demo',
      displayName: 'Admin Demo',
      role: 'admin',
      setupOwnerDepartment: null,
    });
    excelExportService.exportRequests.mockResolvedValue({
      content: Buffer.from('xlsx-content'),
      filename: 'psf_requests_20260619_000506.xlsx',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        checkHealth: jest.fn().mockResolvedValue({ status: 'up' }),
      })
      .overrideProvider(DATABASE_POOL)
      .useValue(pool)
      .overrideProvider(AuthService)
      .useValue(authService)
      .overrideProvider(ExcelExportService)
      .useValue(excelExportService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use((request: Request, _response: Response, next: NextFunction) => {
      (request as AuthenticatedRequest).session = {
        userId: activeUserId,
      } as never;
      next();
    });
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('initializes startup storage in a committed transaction', () => {
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(transactionClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(transactionClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
    expect(transactionClient.query).not.toHaveBeenCalledWith('ROLLBACK');
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/health')
      .expect(200)
      .expect(({ body }: { body: HealthResponseBody }) => {
        expect(body).toMatchObject({
          status: 'ok',
          application: 'backend',
          database: { status: 'up' },
        });
        expect(body.timestamp).toEqual(expect.any(String));
      });
  });

  it('/api/forms/psf-request/schema (GET)', () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          form_key: 'psf-request',
          version: 1,
          title: 'PSF Request Form',
          description: 'Requester-facing MVP schema',
          status: 'active',
          schema_json: { formKey: 'psf-request', version: 1, sections: [] },
          published_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });

    return request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/forms/psf-request/schema')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          formKey: 'psf-request',
          version: 1,
          title: 'PSF Request Form',
          status: 'active',
          schema: { formKey: 'psf-request', version: 1, sections: [] },
          publishedAt: '2026-01-01T00:00:00.000Z',
        });
      });
  });

  it('registers admin form-config routes to save and publish a draft while requester schema reads select the promoted version', async () => {
    const formDefinitions: FormDefinitionRow[] = [
      {
        form_key: 'psf-request',
        version: 1,
        title: 'PSF Request Form',
        description: 'Requester-facing MVP schema',
        status: 'active',
        schema_json: {
          formKey: 'psf-request',
          version: 1,
          title: 'PSF Request Form',
          sections: [
            {
              sectionKey: 'requester_information',
              title: 'Requester Information',
              visibleTo: ['requester', 'setup_owner', 'admin'],
              fields: [
                {
                  fieldKey: 'title',
                  canonicalKey: 'title',
                  label: 'Title',
                  type: 'text',
                  required: true,
                },
              ],
            },
          ],
        },
        created_by: 'system-seed',
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        published_at: new Date('2026-06-01T00:00:00.000Z'),
      },
    ];
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    pool.query.mockImplementation((query: string, values?: unknown[]) => {
      if (query.includes('FOR UPDATE')) {
        return Promise.resolve({ rows: formDefinitions });
      }

      if (query.includes('INSERT INTO form_definitions')) {
        const [
          ,
          formKey,
          version,
          title,
          description,
          schema,
          status,
          createdBy,
        ] = values as [
          string,
          string,
          number,
          string,
          string | null,
          Record<string, unknown>,
          string,
          string,
        ];
        const created: FormDefinitionRow = {
          form_key: formKey,
          version,
          title,
          description,
          status,
          schema_json: schema,
          created_by: createdBy,
          created_at: new Date('2026-06-02T00:00:00.000Z'),
          published_at: null,
        };
        formDefinitions.push(created);
        return Promise.resolve({ rows: [created] });
      }

      if (query.includes("SET status = 'published'")) {
        formDefinitions.forEach((definition) => {
          if (definition.status === 'active') {
            definition.status = 'published';
          }
        });
        return Promise.resolve({ rows: [] });
      }

      if (query.includes("SET status = 'active'")) {
        const [, version] = values as [string, number];
        const promoted = formDefinitions.find(
          (definition) =>
            definition.version === version && definition.status === 'draft',
        );
        if (!promoted) {
          return Promise.resolve({ rows: [] });
        }

        promoted.status = 'active';
        promoted.published_at = new Date('2026-06-03T00:00:00.000Z');
        return Promise.resolve({ rows: [promoted] });
      }

      if (
        query.includes('created_by') &&
        query.includes('ORDER BY version DESC')
      ) {
        return Promise.resolve({
          rows: [...formDefinitions].sort(
            (left, right) => right.version - left.version,
          ),
        });
      }

      if (query.includes("WHERE form_key = $1 AND status = 'active'")) {
        return Promise.resolve({
          rows: formDefinitions.filter(
            (definition) => definition.status === 'active',
          ),
        });
      }

      return Promise.resolve({ rows: [] });
    });

    await request(server)
      .get('/api/admin/form-config')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          formKey: 'psf-request',
          versions: [expect.objectContaining({ version: 1, status: 'active' })],
        });
      });

    await request(server)
      .put('/api/admin/form-config')
      .send({
        description: 'Draft schema for the next requester form revision.',
        schema: {
          formKey: 'psf-request',
          title: 'PSF Request Form v2',
          sections: [
            {
              sectionKey: 'requester_information',
              title: 'Requester Information',
              visibleTo: ['requester', 'setup_owner', 'admin'],
              fields: [
                {
                  fieldKey: 'title',
                  canonicalKey: 'title',
                  label: 'Title',
                  type: 'text',
                  required: true,
                },
              ],
            },
          ],
        },
      })
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          formKey: 'psf-request',
          version: 2,
          status: 'draft',
          createdBy: 'admin.demo',
          schema: { formKey: 'psf-request', version: 2 },
        });
      });

    await request(server)
      .post('/api/admin/form-config/publish')
      .send({ version: 2 })
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          formKey: 'psf-request',
          version: 2,
          status: 'active',
          schema: { formKey: 'psf-request', version: 2 },
        });
      });

    await request(server)
      .get('/api/forms/psf-request/schema')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          formKey: 'psf-request',
          version: 2,
          status: 'active',
          schema: { formKey: 'psf-request', version: 2 },
        });
      });

    const queryCallsBeforeRejection = pool.query.mock.calls.length;
    authService.getProfile.mockResolvedValueOnce({
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester',
      setupOwnerDepartment: null,
    });

    await request(server).get('/api/admin/form-config').expect(403);
    expect(pool.query).toHaveBeenCalledTimes(queryCallsBeforeRejection);
  });

  it('registers admin user-management routes with server-side validation and authorization', async () => {
    const setupOwner = {
      id: '0d41e0f4-f84b-4fa5-86d7-8a6091771d5d',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner' as const,
      setupOwnerDepartment: 'GNTC' as const,
    };
    const updatedUser = {
      ...setupOwner,
      role: 'admin' as const,
      setupOwnerDepartment: null,
    };
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    authService.listUsers.mockResolvedValue([setupOwner]);
    authService.updateUser.mockResolvedValue(updatedUser);

    await request(server)
      .get('/api/admin/users')
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(body).toEqual([setupOwner]);
      });

    await request(server)
      .put(`/api/admin/users/${setupOwner.id}`)
      .send({ role: 'admin', setupOwnerDepartment: null })
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(body).toEqual(updatedUser);
      });
    expect(authService.updateUser).toHaveBeenCalledWith(setupOwner.id, {
      role: 'admin',
      setupOwnerDepartment: null,
    });

    await request(server)
      .put(`/api/admin/users/${setupOwner.id}`)
      .send({ role: 'requester', setupOwnerDepartment: 'GNTC' })
      .expect(400);
    expect(authService.updateUser).toHaveBeenCalledTimes(1);

    await request(server)
      .put('/api/admin/users/not-a-uuid')
      .send({ role: 'requester', setupOwnerDepartment: null })
      .expect(400)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('userId must be a UUID.');
      });
    expect(authService.updateUser).toHaveBeenCalledTimes(1);

    const missingUserId = 'eb2ac6f0-30e6-474e-b099-ea0cb2347c11';
    authService.updateUser.mockResolvedValueOnce(null);
    await request(server)
      .put(`/api/admin/users/${missingUserId}`)
      .send({ role: 'requester', setupOwnerDepartment: null })
      .expect(404)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('User not found.');
      });
    expect(authService.updateUser).toHaveBeenLastCalledWith(missingUserId, {
      role: 'requester',
      setupOwnerDepartment: null,
    });

    authService.getProfile.mockResolvedValueOnce({
      ...setupOwner,
      role: 'requester',
      setupOwnerDepartment: null,
    });
    await request(server).get('/api/admin/users').expect(403);
    expect(authService.listUsers).toHaveBeenCalledTimes(1);
  });

  it('registers admin workflow transition routes that persist one complete replacement and enforce admin authorization', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .get('/api/admin/workflow')
      .expect(200)
      .expect(
        ({
          body,
        }: {
          body: { statuses: string[]; transitions: unknown[] };
        }) => {
          expect(body.statuses).toEqual(MANUAL_WORKFLOW_STATUSES);
          expect(body.transitions).toHaveLength(42);
        },
      );

    const gntcOnly = buildWorkflowConfiguration((fromStatus, toStatus) =>
      fromStatus === 'Submitted' && toStatus === 'Setup In Progress'
        ? {
            allowedRoles: [],
            allowedSetupOwnerDepartments: ['GNTC'],
          }
        : {
            enabled: false,
            allowedRoles: [],
            allowedSetupOwnerDepartments: [],
          },
    );

    await request(server)
      .put('/api/admin/workflow')
      .send(gntcOnly)
      .expect(200)
      .expect(
        ({
          body,
        }: {
          body: { transitions: Array<Record<string, unknown>> };
        }) => {
          expect(
            body.transitions.find(
              (transition) =>
                transition.fromStatus === 'Submitted' &&
                transition.toStatus === 'Setup In Progress',
            ),
          ).toMatchObject({
            enabled: true,
            allowedRoles: [],
            allowedSetupOwnerDepartments: ['GNTC'],
          });
        },
      );

    const defaultPoolQuery = pool.query.getMockImplementation() as
      | PoolQuery
      | undefined;
    if (!defaultPoolQuery) {
      throw new Error('Expected the workflow storage query mock');
    }
    pool.query.mockImplementation((query: string, values?: unknown[]) => {
      if (query.includes('FROM psf_requests')) {
        return Promise.resolve({
          rows: [
            {
              id: 'request-1',
              status: 'Submitted',
              requester_user_id: null,
            },
          ],
        });
      }

      return defaultPoolQuery(query, values);
    });

    activeUserId = 'setup-owner-gntc';
    authService.getProfile.mockResolvedValueOnce({
      id: 'setup-owner-gntc',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });
    await request(server)
      .get('/api/requests/request-1/status-options')
      .expect(200)
      .expect(({ body }: { body: { allowedNextStatuses: string[] } }) => {
        expect(body.allowedNextStatuses).toEqual(['Setup In Progress']);
      });

    activeUserId = 'setup-owner-mfg';
    authService.getProfile.mockResolvedValueOnce({
      id: 'setup-owner-mfg',
      username: 'setup.mfg.demo',
      displayName: 'Setup Owner MFG Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'MFG',
    });
    await request(server)
      .put('/api/requests/request-1/status')
      .send({ status: 'Setup In Progress' })
      .expect(403);

    activeUserId = 'requester-1';
    authService.getProfile.mockResolvedValueOnce({
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester',
      setupOwnerDepartment: null,
    });
    await request(server).get('/api/admin/workflow').expect(403);
  });

  it('registers admin autofill rules that validate canonical keys, persist atomically, and are readable through the runtime service', async () => {
    const activeDefinition: FormDefinitionRow = {
      form_key: 'psf-request',
      version: 1,
      title: 'PSF Request Form',
      description: null,
      status: 'active',
      schema_json: {
        formKey: 'psf-request',
        version: 1,
        title: 'PSF Request Form',
        sections: [
          {
            sectionKey: 'requester_information',
            title: 'Requester Information',
            visibleTo: ['requester', 'setup_owner', 'admin'],
            fields: [
              {
                fieldKey: 'reference_psf_name',
                canonicalKey: 'reference_psf_name',
                label: 'Reference PSF Name',
                type: 'text',
                required: false,
                autofillTrigger: true,
              },
              {
                fieldKey: 'reference_product',
                canonicalKey: 'reference_product',
                label: 'Reference Product',
                type: 'text',
                required: false,
                autofillTrigger: true,
              },
              {
                fieldKey: 'product',
                canonicalKey: 'product',
                label: 'Product',
                type: 'text',
                required: true,
              },
              {
                fieldKey: 'wafer_fab',
                canonicalKey: 'wafer_fab',
                label: 'Wafer FAB',
                type: 'text',
                required: true,
              },
            ],
          },
        ],
      },
      created_by: 'system-seed',
      created_at: new Date('2026-08-11T00:00:00.000Z'),
      published_at: new Date('2026-08-11T00:00:00.000Z'),
    };
    const storedRules: Array<{
      id: string;
      form_key: string;
      trigger_canonical_key: string;
      lookup_source: string;
      fill_targets_json: string[];
      status: string;
      created_at: Date;
      updated_at: Date;
    }> = [];
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    pool.query.mockImplementation((query: string, values?: unknown[]) => {
      if (
        query.includes('FROM form_definitions') &&
        query.includes('LIMIT 1') &&
        query.includes('FOR UPDATE')
      ) {
        return Promise.resolve({ rows: [{ form_key: 'psf-request' }] });
      }

      if (
        query.includes('FROM form_definitions') &&
        query.includes('FOR UPDATE')
      ) {
        return Promise.resolve({ rows: [activeDefinition] });
      }

      if (query.includes('INSERT INTO autofill_rules')) {
        const [
          id,
          formKey,
          triggerCanonicalKey,
          lookupSource,
          fillTargetsJson,
          status,
        ] = values as [string, string, string, string, string, string];
        if (
          storedRules.some(
            (rule) =>
              rule.form_key === formKey &&
              rule.trigger_canonical_key === triggerCanonicalKey,
          )
        ) {
          return Promise.reject(
            Object.assign(new Error('duplicate rule'), { code: '23505' }),
          );
        }

        const created = {
          id,
          form_key: formKey,
          trigger_canonical_key: triggerCanonicalKey,
          lookup_source: lookupSource,
          fill_targets_json: JSON.parse(fillTargetsJson) as string[],
          status,
          created_at: new Date('2026-08-11T10:00:00.000Z'),
          updated_at: new Date('2026-08-11T10:00:00.000Z'),
        };
        storedRules.push(created);
        return Promise.resolve({ rows: [created] });
      }

      if (query.includes('UPDATE autofill_rules')) {
        const [triggerCanonicalKey, fillTargetsJson, ruleId, formKey] =
          values as [string, string, string, string];
        const existing = storedRules.find(
          (rule) => rule.id === ruleId && rule.form_key === formKey,
        );
        if (!existing) {
          return Promise.resolve({ rows: [] });
        }
        if (
          storedRules.some(
            (rule) =>
              rule.id !== ruleId &&
              rule.form_key === formKey &&
              rule.trigger_canonical_key === triggerCanonicalKey,
          )
        ) {
          return Promise.reject(
            Object.assign(new Error('duplicate rule'), { code: '23505' }),
          );
        }

        existing.trigger_canonical_key = triggerCanonicalKey;
        existing.fill_targets_json = JSON.parse(fillTargetsJson) as string[];
        existing.updated_at = new Date('2026-08-11T11:00:00.000Z');
        return Promise.resolve({ rows: [existing] });
      }

      if (query.includes('FROM autofill_rules')) {
        return Promise.resolve({ rows: storedRules });
      }

      return Promise.resolve({ rows: [] });
    });

    await request(server).get('/api/admin/autofill').expect(200).expect([]);

    let ruleId = '';
    await request(server)
      .post('/api/admin/autofill')
      .send({
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_psf_name',
        targetCanonicalKeys: ['product', 'wafer_fab'],
      })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        ruleId = body.id as string;
        expect(body).toMatchObject({
          formKey: 'psf-request',
          triggerCanonicalKey: 'reference_psf_name',
          targetCanonicalKeys: ['product', 'wafer_fab'],
          lookupSource: 'previous_completed_submission',
          status: 'active',
        });
      });
    expect(ruleId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    await request(server)
      .get('/api/admin/autofill')
      .expect(200)
      .expect(({ body }: { body: Array<Record<string, unknown>> }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ id: ruleId });
      });

    await request(server)
      .put(`/api/admin/autofill/${ruleId}`)
      .send({
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_product',
        targetCanonicalKeys: ['product'],
      })
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          id: ruleId,
          triggerCanonicalKey: 'reference_product',
          targetCanonicalKeys: ['product'],
        });
      });

    await expect(
      app.get(AutofillService).getActiveRules('psf-request'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: ruleId,
        triggerCanonicalKey: 'reference_product',
        targetCanonicalKeys: ['product'],
      }),
    ]);

    const rulesBeforeRejectedMutations = JSON.stringify(storedRules);
    await request(server)
      .post('/api/admin/autofill')
      .send({
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_product',
        targetCanonicalKeys: ['wafer_fab'],
      })
      .expect(409);
    await request(server)
      .put(`/api/admin/autofill/${ruleId}`)
      .send({
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_product',
        targetCanonicalKeys: ['unknown_target'],
      })
      .expect(400);
    await request(server)
      .post('/api/admin/autofill')
      .send({
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_psf_name',
        targetCanonicalKeys: ['product'],
        unexpected: true,
      })
      .expect(400);
    expect(JSON.stringify(storedRules)).toBe(rulesBeforeRejectedMutations);

    activeUserId = undefined;
    await request(server).get('/api/admin/autofill').expect(401);

    activeUserId = 'requester-1';
    authService.getProfile.mockResolvedValueOnce({
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester',
      setupOwnerDepartment: null,
    });
    await request(server).get('/api/admin/autofill').expect(403);
  });

  it('serves authenticated requester runtime autofill suggestions from completed canonical values without exposing source request data', async () => {
    const runtimeRule = {
      id: '75806824-f1b1-4c2a-bb47-41928cb78609',
      form_key: 'psf-request',
      trigger_canonical_key: 'reference_psf_name',
      lookup_source: 'previous_completed_submission',
      fill_targets_json: ['product', 'wafer_fab'],
      status: 'active',
      created_at: new Date('2026-08-11T10:00:00.000Z'),
      updated_at: new Date('2026-08-11T10:00:00.000Z'),
    };
    const defaultPoolQuery = pool.query.getMockImplementation() as
      | PoolQuery
      | undefined;
    if (!defaultPoolQuery) {
      throw new Error('Expected the default pool query mock');
    }

    pool.query.mockClear();
    pool.query.mockImplementation((query: string, values?: unknown[]) => {
      if (query.includes('FROM autofill_rules')) {
        return Promise.resolve({ rows: [runtimeRule] });
      }

      if (query.includes('WITH matched_source')) {
        expect(values).toEqual([
          'psf-request',
          'reference_psf_name',
          JSON.stringify('REF-PSF-1'),
          ['product', 'wafer_fab'],
        ]);
        return Promise.resolve({
          rows: [
            {
              matched: true,
              canonical_key: 'product',
              value_json: 'New Product',
            },
            { matched: true, canonical_key: 'wafer_fab', value_json: 'Fab A' },
          ],
        });
      }

      return defaultPoolQuery(query, values);
    });

    activeUserId = 'requester-1';
    authService.getProfile.mockResolvedValueOnce({
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester',
      setupOwnerDepartment: null,
    });

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get(
        '/api/autofill?formKey=psf-request&field=reference_psf_name&value=REF-PSF-1',
      )
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toEqual({
          matched: true,
          suggestedValues: {
            product: 'New Product',
            wafer_fab: 'Fab A',
          },
        });
        expect(body).not.toHaveProperty('sourceRequest');
        expect(JSON.stringify(body)).not.toContain('request_no');
        expect(JSON.stringify(body)).not.toContain('requester_data_json');
      });

    activeUserId = undefined;
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get(
        '/api/autofill?formKey=psf-request&field=reference_psf_name&value=REF-PSF-1',
      )
      .expect(401);

    activeUserId = 'setup-owner-1';
    authService.getProfile.mockResolvedValueOnce({
      id: 'setup-owner-1',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get(
        '/api/autofill?formKey=psf-request&field=reference_psf_name&value=REF-PSF-1',
      )
      .expect(403)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe(
          'Setup File Owners cannot edit requester-owned fields',
        );
      });
  });

  it('registers an explicit Draft schema upgrade route that returns the upgraded authoritative snapshot', async () => {
    const requesterId = '9a704ed6-3e0f-4501-a0bc-3a0e8d5f7a0e';
    const oldSchema = {
      formKey: 'psf-request',
      version: 1,
      title: 'PSF Request Form v1',
      sections: [
        {
          sectionKey: 'requester_information',
          title: 'Requester Information',
          visibleTo: ['requester'],
          fields: [
            {
              fieldKey: 'product_type',
              canonicalKey: 'product_type',
              label: 'Product Type',
              type: 'text',
              required: true,
            },
            {
              fieldKey: 'legacy_field',
              canonicalKey: 'legacy_field',
              label: 'Legacy Field',
              type: 'text',
              required: false,
            },
          ],
        },
      ],
    };
    const activeSchema = {
      formKey: 'psf-request',
      version: 2,
      title: 'PSF Request Form v2',
      sections: [
        {
          sectionKey: 'requester_information',
          title: 'Requester Information',
          visibleTo: ['requester'],
          fields: [
            {
              fieldKey: 'product_type',
              canonicalKey: 'product_type',
              label: 'Product Type',
              type: 'text',
              required: true,
            },
            {
              fieldKey: 'requester_name',
              canonicalKey: 'requester',
              label: 'Requester Name',
              type: 'text',
              required: true,
            },
            {
              fieldKey: 'new_field',
              canonicalKey: 'new_field',
              label: 'New Field',
              type: 'text',
              required: false,
            },
          ],
        },
      ],
    };
    const activeDefinition: FormDefinitionRow = {
      form_key: 'psf-request',
      version: 2,
      title: activeSchema.title,
      description: null,
      status: 'active',
      schema_json: activeSchema,
      created_by: 'admin-1',
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      published_at: new Date('2026-08-02T00:00:00.000Z'),
    };
    const lockedDraft = {
      id: 'request-1',
      form_key: 'psf-request',
      form_version: 1,
      status: 'Draft',
      requester: 'Requester Demo',
      requester_user_id: requesterId,
      requester_data_json: {
        legacy_field: 'remove on upgrade',
        product_type: 'Existing Product',
      },
      schema_snapshot_json: oldSchema,
    };
    const upgradedRow = {
      ...lockedDraft,
      request_no: 'DRAFT-0001',
      form_version: 2,
      product_type: 'Existing Product',
      requester_data_json: {
        new_field: '',
        product_type: 'Existing Product',
        requester_name: 'Requester Demo',
      },
      psf_created_data_json: {},
      schema_snapshot_json: activeSchema,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      updated_at: new Date('2026-08-09T00:00:00.000Z'),
      submitted_at: null,
      psf_created_at: null,
      completed_at: null,
      setup_owner: null,
      setup_owner_role: null,
    };

    activeUserId = requesterId;
    authService.getProfile.mockResolvedValue({
      id: requesterId,
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester',
      setupOwnerDepartment: null,
    });
    pool.query.mockClear();
    transactionClient.query.mockClear();
    transactionClient.release.mockClear();
    pool.query.mockImplementation((query: string) => {
      if (query.includes('FROM psf_requests') && query.includes('FOR UPDATE')) {
        return Promise.resolve({ rows: [lockedDraft] });
      }

      if (
        query.includes('FROM form_definitions') &&
        query.includes('LIMIT 1')
      ) {
        return Promise.resolve({ rows: [{ form_key: 'psf-request' }] });
      }

      if (
        query.includes('FROM form_definitions') &&
        query.includes('FOR UPDATE')
      ) {
        return Promise.resolve({ rows: [activeDefinition] });
      }

      if (query.includes('UPDATE psf_requests')) {
        return Promise.resolve({ rows: [upgradedRow] });
      }

      return Promise.resolve({ rows: [] });
    });

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/api/requests/request-1/upgrade-schema')
      .send({ formVersion: 2 })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          formKey: 'psf-request',
          formVersion: 2,
          id: 'request-1',
          requesterData: {
            new_field: '',
            product_type: 'Existing Product',
            requester_name: 'Requester Demo',
          },
          schemaSnapshot: { formKey: 'psf-request', version: 2 },
          status: 'Draft',
        });
      });

    expect(transactionClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(transactionClient.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      ['request-1'],
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE psf_requests'),
      expect.arrayContaining(['request-1', 2]),
    );
    expect(transactionClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(transactionClient.release).toHaveBeenCalledTimes(1);
  });

  it('/api/requests/export.xlsx (GET) sends an XLSX attachment for an admin', () => {
    return request(app.getHttpServer() as Parameters<typeof request>[0])
      .get(
        '/api/requests/export.xlsx?status=Submitted&from=2026-06-01&to=2026-06-30',
      )
      .expect(200)
      .expect(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .expect(
        'Content-Disposition',
        'attachment; filename="psf_requests_20260619_000506.xlsx"',
      )
      .expect(() => {
        expect(authService.getProfile).toHaveBeenCalledWith('admin-1');
        expect(excelExportService.exportRequests).toHaveBeenCalledWith({
          status: 'Submitted',
          requestDateFrom: '2026-06-01',
          requestDateTo: '2026-06-30',
        });
      });
  });

  it('/api/requests/export.xlsx (GET) rejects a non-admin before exporting', () => {
    authService.getProfile.mockResolvedValueOnce({
      id: 'requester-1',
      username: 'requester.demo',
      displayName: 'Requester Demo',
      role: 'requester',
      setupOwnerDepartment: null,
    });

    return request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/requests/export.xlsx')
      .expect(403)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('Only admins can export requests.');
        expect(excelExportService.exportRequests).not.toHaveBeenCalled();
      });
  });

  it('does not expose requester-facing active schema reads under the admin namespace', () => {
    return request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/admin/form-definitions/psf-request/active')
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
