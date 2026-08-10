import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { DATABASE_POOL } from '../database/database.service';
import { AuthenticatedUserProfile, UserRole } from './session.types';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  setup_owner_department: 'GNTC' | 'MFG' | null;
}

interface SeedUser {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  setupOwnerDepartment: 'GNTC' | 'MFG' | null;
}

export interface UpdateUserProfileInput {
  role: UserRole;
  setupOwnerDepartment: 'GNTC' | 'MFG' | null;
}

const SEED_USERS: SeedUser[] = [
  {
    username: 'requester.demo',
    displayName: 'Requester Demo',
    password: 'RequesterDemo123!',
    role: 'requester',
    setupOwnerDepartment: null,
  },
  {
    username: 'setup.gntc.demo',
    displayName: 'Setup Owner GNTC Demo',
    password: 'SetupGntcDemo123!',
    role: 'setup_owner',
    setupOwnerDepartment: 'GNTC',
  },
  {
    username: 'setup.mfg.demo',
    displayName: 'Setup Owner MFG Demo',
    password: 'SetupMfgDemo123!',
    role: 'setup_owner',
    setupOwnerDepartment: 'MFG',
  },
  {
    username: 'admin.demo',
    displayName: 'Admin Demo',
    password: 'AdminDemo123!',
    role: 'admin',
    setupOwnerDepartment: null,
  },
];

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.ensureUsersTable();
    await this.seedUsers();
  }

  async validateCredentials(
    username: string,
    password: string,
  ): Promise<AuthenticatedUserProfile> {
    const normalizedUsername = username.trim().toLowerCase();

    if (!normalizedUsername || !password) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const user = await this.findUserByUsername(normalizedUsername);

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    return this.toProfile(user);
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

    const result = await this.pool.query<UserRow>(
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
  }

  private async ensureUsersTable(): Promise<void> {
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('requester', 'setup_owner', 'admin')),
        setup_owner_department TEXT CHECK (setup_owner_department IN ('GNTC', 'MFG')),
        CONSTRAINT app_users_role_department_consistency CHECK (
          (role = 'setup_owner' AND setup_owner_department IS NOT NULL)
          OR (role IN ('requester', 'admin') AND setup_owner_department IS NULL)
        ),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
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
            (role = 'setup_owner' AND setup_owner_department IS NOT NULL)
            OR (role IN ('requester', 'admin') AND setup_owner_department IS NULL)
          ) NOT VALID;
        END IF;
      END
      $$;
    `);
  }

  private async seedUsers(): Promise<void> {
    for (const user of SEED_USERS) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await this.pool.query(
        `INSERT INTO app_users (username, display_name, password_hash, role, setup_owner_department)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO NOTHING`,
        [
          user.username,
          user.displayName,
          passwordHash,
          user.role,
          user.setupOwnerDepartment,
        ],
      );
    }
  }

  private async findUserByUsername(username: string): Promise<UserRow | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, username, display_name, password_hash, role, setup_owner_department
       FROM app_users
       WHERE username = $1`,
      [username],
    );

    return result.rows[0] ?? null;
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
