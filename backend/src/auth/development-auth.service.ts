import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.service';
import { AuthService } from './auth.service';
import type { UserRole } from './session.types';

// Temporary local identities. LDAP and all authorization remain in AuthService.
const identities = new Map<
  string,
  {
    username: string;
    displayName: string;
    role: UserRole;
    department: 'GNTC' | 'MFG' | null;
  }
>([
  [
    'requester',
    {
      username: 'dev.requester',
      displayName: 'Development Requester',
      role: 'requester',
      department: null,
    },
  ],
  [
    'setup_owner_gntc',
    {
      username: 'dev.setup-gntc',
      displayName: 'Development Setup Owner GNTC',
      role: 'setup_owner',
      department: 'GNTC',
    },
  ],
  [
    'setup_owner_mfg',
    {
      username: 'dev.setup-mfg',
      displayName: 'Development Setup Owner MFG',
      role: 'setup_owner',
      department: 'MFG',
    },
  ],
  [
    'admin',
    {
      username: 'dev.admin',
      displayName: 'Development Administrator',
      role: 'admin',
      department: null,
    },
  ],
]);

@Injectable()
export class DevelopmentAuthService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  async login(identity: unknown) {
    if (
      !['development', 'test'].includes(process.env.NODE_ENV ?? '') ||
      this.config.get<string>('DEV_AUTH_ENABLED', 'false') !== 'true'
    ) {
      throw new NotFoundException();
    }
    const definition =
      typeof identity === 'string' ? identities.get(identity) : undefined;
    if (!definition) throw new NotFoundException();

    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO app_users (
         username, display_name, password_hash, role, setup_owner_department,
         email, employee_id, title
       )
       VALUES ($1, $2, NULL, $3, $4, NULL, NULL, 'Development test identity')
       ON CONFLICT (username) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role,
         setup_owner_department = EXCLUDED.setup_owner_department,
         updated_at = NOW()
       RETURNING id`,
      [
        definition.username,
        definition.displayName,
        definition.role,
        definition.department,
      ],
    );
    const user = await this.auth.getProfile(result.rows[0].id);
    if (!user) throw new NotFoundException();
    return user;
  }
}
