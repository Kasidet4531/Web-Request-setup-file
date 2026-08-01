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

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let activeUserId: string | undefined;
  const authService = { getProfile: jest.fn() };
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
    pool.query.mockResolvedValue({ rows: [] });
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
