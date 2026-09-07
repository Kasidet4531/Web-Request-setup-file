import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { DATABASE_POOL } from '../database/database.service';
import { AuthenticatedUserProfile, UserRole } from './session.types';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string | null;
  role: UserRole;
  setup_owner_department: 'GNTC' | 'MFG' | null;
  email: string | null;
  employee_id: string | null;
  title: string | null;
}

export interface UpdateUserProfileInput {
  role: UserRole;
  setupOwnerDepartment: 'GNTC' | 'MFG' | null;
}

interface LdapUserData {
  email: string;
  name: string;
  user: string;
  employeeId: string;
  title: string;
}

interface LdapAuthResponse {
  status?: unknown;
  data?: unknown;
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureUsersTable();
    await this.provisionInitialAdmin();
  }

  async validateCredentials(
    username: string,
    password: string,
  ): Promise<AuthenticatedUserProfile> {
    const normalizedUsername = username.trim().toLowerCase();

    if (!normalizedUsername || !password) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const ldapUrl = this.configService.getOrThrow<string>('LDAP_AUTH_URL');
    const configuredTimeout = Number(
      this.configService.get<string>('LDAP_AUTH_TIMEOUT_MS', '10000'),
    );
    const timeoutMs =
      Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 10000;

    let response: Response;
    let ldapResponse: LdapAuthResponse;
    try {
      response = await fetch(ldapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedUsername, password }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      ldapResponse = (await response.json()) as LdapAuthResponse;
    } catch {
      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
      );
    }

    if (ldapResponse?.status === '401') {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!response.ok || ldapResponse?.status !== '200') {
      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
      );
    }

    const ldapData = ldapResponse?.data;
    if (!this.isValidLdapUser(ldapData)) {
      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
      );
    }

    const ldapUsername = ldapData.user.trim().toLowerCase();
    if (ldapUsername !== normalizedUsername) {
      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
      );
    }

    return this.upsertFromLdap(ldapUsername, ldapData);
  }

  async getProfile(userId: string): Promise<AuthenticatedUserProfile | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, username, display_name, password_hash, role, setup_owner_department
       FROM app_users
       WHERE id = $1`,
      [userId],
    );

    const user = result.rows[0];
    return user ? this.toProfile(user) : null;
  }

  async listUsers(): Promise<AuthenticatedUserProfile[]> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, username, display_name, password_hash, role, setup_owner_department
       FROM app_users
       ORDER BY display_name ASC, username ASC`,
    );

    return result.rows.map((user) => this.toProfile(user));
  }

  async updateUser(
    userId: string,
    update: UpdateUserProfileInput,
  ): Promise<AuthenticatedUserProfile | null> {
    this.assertValidRoleDepartmentPairing(update);

    return this.withTransaction(async (client) => {
      await client.query('LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE');
      const current = await client.query<Pick<UserRow, 'id' | 'role'>>(
        `SELECT id, role
         FROM app_users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      const currentUser = current.rows[0];
      if (!currentUser) {
        return null;
      }

      if (currentUser.role === 'admin' && update.role !== 'admin') {
        const administrators = await client.query<{ admin_count: number }>(
          `SELECT COUNT(*)::int AS admin_count
           FROM app_users
           WHERE role = 'admin'`,
        );
        if ((administrators.rows[0]?.admin_count ?? 0) <= 1) {
          throw new BadRequestException(
            'At least one administrator must remain.',
          );
        }
      }

      const result = await client.query<UserRow>(
        `UPDATE app_users
         SET role = $2,
             setup_owner_department = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, username, display_name, password_hash, role, setup_owner_department`,
        [userId, update.role, update.setupOwnerDepartment],
      );

      const user = result.rows[0];
      return user ? this.toProfile(user) : null;
    });
  }

  private async ensureUsersTable(): Promise<void> {
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL CHECK (role IN ('requester', 'setup_owner', 'admin')),
        setup_owner_department TEXT CHECK (setup_owner_department IN ('GNTC', 'MFG')),
        email TEXT,
        employee_id TEXT,
        title TEXT,
        CONSTRAINT app_users_role_department_consistency CHECK (
          (role = 'setup_owner' AND setup_owner_department IS NOT NULL AND setup_owner_department IN ('GNTC', 'MFG'))
          OR (role IN ('requester', 'admin') AND setup_owner_department IS NULL)
        ),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      ALTER TABLE app_users ALTER COLUMN password_hash DROP NOT NULL;
      ALTER TABLE app_users ALTER COLUMN password_hash DROP DEFAULT;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employee_id TEXT;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS title TEXT;
    `);

    await this.pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'app_users'::regclass
            AND conname = 'app_users_role_department_consistency'
        ) THEN
          ALTER TABLE app_users
          ADD CONSTRAINT app_users_role_department_consistency CHECK (
            (role = 'setup_owner' AND setup_owner_department IS NOT NULL AND setup_owner_department IN ('GNTC', 'MFG'))
            OR (role IN ('requester', 'admin') AND setup_owner_department IS NULL)
          ) NOT VALID;
        END IF;
      END
      $$;
    `);

    const inconsistentUsers = await this.pool.query<{ id: string }>(`
      SELECT id
      FROM app_users
      WHERE (
        (role = 'setup_owner' AND setup_owner_department IS NOT NULL AND setup_owner_department IN ('GNTC', 'MFG'))
        OR (role IN ('requester', 'admin') AND setup_owner_department IS NULL)
      ) IS NOT TRUE
      LIMIT 1
    `);
    if (inconsistentUsers.rows.length > 0) {
      throw new Error(
        'Cannot start because app_users contains invalid role and department data. Repair existing rows so Setup File Owners have GNTC or MFG and requesters or administrators have no department, then restart.',
      );
    }

    await this.pool.query(`
      ALTER TABLE app_users
      VALIDATE CONSTRAINT app_users_role_department_consistency
    `);
  }

  private isValidLdapUser(data: unknown): data is LdapUserData {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return false;
    }

    const candidate = data as Record<string, unknown>;
    return (
      typeof candidate.user === 'string' &&
      candidate.user.trim().length > 0 &&
      typeof candidate.name === 'string' &&
      candidate.name.trim().length > 0 &&
      typeof candidate.email === 'string' &&
      typeof candidate.employeeId === 'string' &&
      typeof candidate.title === 'string'
    );
  }

  private async upsertFromLdap(
    username: string,
    data: LdapUserData,
  ): Promise<AuthenticatedUserProfile> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO app_users (
         username, display_name, password_hash, role, setup_owner_department,
         email, employee_id, title
       )
       VALUES ($1, $2, NULL, 'requester', NULL, $3, $4, $5)
       ON CONFLICT (username) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         employee_id = EXCLUDED.employee_id,
         title = EXCLUDED.title,
         updated_at = NOW()
       RETURNING *`,
      [username, data.name, data.email, data.employeeId, data.title],
    );

    return this.toProfile(result.rows[0]);
  }

  private async provisionInitialAdmin(): Promise<void> {
    const configuredUsername = this.configService.get<string>(
      'INITIAL_ADMIN_USERNAME',
      '',
    );
    const adminUsername =
      typeof configuredUsername === 'string'
        ? configuredUsername.trim().toLowerCase()
        : '';
    if (!adminUsername) {
      return;
    }

    await this.pool.query(
      `INSERT INTO app_users (
         username, display_name, password_hash, role, setup_owner_department
       )
       VALUES ($1, $1, NULL, 'admin', NULL)
       ON CONFLICT (username) DO UPDATE SET
         role = 'admin',
         setup_owner_department = NULL,
         updated_at = NOW()`,
      [adminUsername],
    );
  }

  private assertValidRoleDepartmentPairing(
    update: UpdateUserProfileInput,
  ): void {
    if (update.role === 'setup_owner') {
      if (
        update.setupOwnerDepartment !== 'GNTC' &&
        update.setupOwnerDepartment !== 'MFG'
      ) {
        throw new BadRequestException(
          'Setup File Owners must belong to GNTC or MFG.',
        );
      }

      return;
    }

    if (update.setupOwnerDepartment !== null) {
      throw new BadRequestException(
        'Only Setup File Owners may have a department.',
      );
    }
  }

  private async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await this.rollbackTransaction(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async rollbackTransaction(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original update error if rollback also fails.
    }
  }

  private toProfile(user: UserRow): AuthenticatedUserProfile {
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      setupOwnerDepartment: user.setup_owner_department,
    };
  }
}
