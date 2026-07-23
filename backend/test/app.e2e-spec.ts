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

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let activeUserId: string | undefined;
  const authService = { getProfile: jest.fn() };
  const excelExportService = { exportRequests: jest.fn() };
  const pool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
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
