import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import {
  DATABASE_POOL,
  DatabaseService,
} from './../src/database/database.service';

interface HealthResponseBody {
  status: string;
  application: string;
  database: { status: string };
  timestamp: string;
}

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const pool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        checkHealth: jest.fn().mockResolvedValue({ status: 'up' }),
      })
      .overrideProvider(DATABASE_POOL)
      .useValue(pool)
      .compile();

    app = moduleFixture.createNestApplication();
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

  it('does not expose requester-facing active schema reads under the admin namespace', () => {
    return request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/admin/form-definitions/psf-request/active')
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
