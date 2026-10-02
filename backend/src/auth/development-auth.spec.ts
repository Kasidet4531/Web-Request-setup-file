import { Global, INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import session from 'express-session';
import request from 'supertest';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { DATABASE_POOL } from '../database/database.service';
import type { AuthenticatedUserProfile } from './session.types';

describe('local development authentication HTTP flow', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let app: INestApplication;
  let enabled: string | undefined;
  let rows: Record<string, unknown>[];
  let query: jest.Mock;

  beforeEach(async () => {
    process.env.NODE_ENV = 'development';
    enabled = 'true';
    rows = [];
    query = jest.fn((sql: string, values?: unknown[]) => {
      if (sql.includes('INSERT INTO app_users') && values) {
        const row = {
          id: `id-${String(values[0])}`,
          username: values[0],
          display_name: values[1],
          role: values[2],
          setup_owner_department: values[3],
          email: null,
        };
        rows = [row];
        return Promise.resolve({ rows });
      }
      if (
        sql.includes('WHERE id = $1') ||
        sql.includes('ORDER BY display_name')
      ) {
        return Promise.resolve({ rows });
      }
      return Promise.resolve({ rows: [] });
    });
    @Global()
    @Module({
      providers: [
        { provide: DATABASE_POOL, useValue: { query } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) =>
              key === 'DEV_AUTH_ENABLED' ? enabled : fallback,
          },
        },
      ],
      exports: [DATABASE_POOL, ConfigService],
    })
    class TestDependencies {}
    const module = await Test.createTestingModule({
      imports: [TestDependencies, AuthModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      session({
        secret: 'local-test-secret',
        resave: false,
        saveUninitialized: false,
      }),
    );
    await app.init();
    query.mockClear();
  });

  afterEach(async () => {
    await app.close();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it.each([
    ['requester', 'dev.requester', 'requester', null],
    ['setup_owner_gntc', 'dev.setup-gntc', 'setup_owner', 'GNTC'],
    ['setup_owner_mfg', 'dev.setup-mfg', 'setup_owner', 'MFG'],
    ['admin', 'dev.admin', 'admin', null],
  ])(
    'logs in as %s and resolves the current profile through the same session',
    async (identity, username, role, department) => {
      const agent = request.agent(
        app.getHttpServer() as Parameters<typeof request>[0],
      );
      const login = await agent
        .post('/api/dev/login')
        .send({ identity })
        .expect(200);
      expect(login.body).toEqual({
        user: {
          id: `id-${String(username)}`,
          username,
          displayName: expect.any(String) as string,
          role,
          setupOwnerDepartment: department,
        },
      });
      await agent
        .get('/api/me')
        .expect(200)
        .expect(login.body as object);
      rows[0].role = 'requester';
      rows[0].setup_owner_department = null;
      const fresh = await agent.get('/api/me').expect(200);
      expect((fresh.body as { user: AuthenticatedUserProfile }).user.role).toBe(
        'requester',
      );
      await agent.post('/api/logout').expect(204);
      await agent.get('/api/me').expect(401);
      expect((await app.get(AuthService).listUsers())[0].email).toBeNull();
    },
  );

  it.each(['production', 'staging', ''])(
    'rejects mock login in %s even with the flag enabled',
    async (mode) => {
      process.env.NODE_ENV = mode;
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/dev/login')
        .send({ identity: 'admin' })
        .expect(404);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'false', 'TRUE'])(
    'rejects mock login when the flag is %s',
    async (flag) => {
      enabled = flag;
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/dev/login')
        .send({ identity: 'admin' })
        .expect(404);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(['unknown', 'constructor', '__proto__', null, {}, 1])(
    'rejects invalid identity %s without touching the database',
    async (identity) => {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/dev/login')
        .send({ identity })
        .expect(404);
      expect(query).not.toHaveBeenCalled();
    },
  );
});
