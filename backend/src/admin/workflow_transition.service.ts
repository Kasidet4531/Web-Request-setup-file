import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import type { AuthenticatedUserProfile, UserRole } from '../auth/session.types';
import { DATABASE_POOL } from '../database/database.service';

export const MANUAL_WORKFLOW_STATUSES = [
  'Submitted',
  'Setup In Progress',
  'Need More Information',
  'PSF Created',
  'Completed',
  'Rejected',
  'Cancelled',
] as const;

export const SETUP_OWNER_DEPARTMENTS = ['GNTC', 'MFG'] as const;

export type ManualWorkflowStatus = (typeof MANUAL_WORKFLOW_STATUSES)[number];
export type SetupOwnerDepartment = (typeof SETUP_OWNER_DEPARTMENTS)[number];

export interface WorkflowTransitionRule {
  fromStatus: ManualWorkflowStatus;
  toStatus: ManualWorkflowStatus;
  enabled: boolean;
  allowedRoles: UserRole[];
  allowedSetupOwnerDepartments: SetupOwnerDepartment[];
}

export interface WorkflowTransitionConfigurationInput {
  transitions: WorkflowTransitionRule[];
}

export interface WorkflowTransitionConfiguration extends WorkflowTransitionConfigurationInput {
  statuses: ManualWorkflowStatus[];
}

interface WorkflowTransitionConfigurationRow {
  config_json: unknown;
}

const DRAFT_STATUS = 'Draft';
const WORKFLOW_TRANSITION_CONFIGURATION_KEY = 'manual-transition-rules';
const USER_ROLES: UserRole[] = ['requester', 'setup_owner', 'admin'];
const MANUAL_STATUS_SET = new Set<string>(MANUAL_WORKFLOW_STATUSES);
const USER_ROLE_SET = new Set<string>(USER_ROLES);
const SETUP_OWNER_DEPARTMENT_SET = new Set<string>(SETUP_OWNER_DEPARTMENTS);

type QueryRunner = Pick<Pool | PoolClient, 'query'>;

const DEFAULT_STATUS_TRANSITIONS_BY_ROLE: Record<
  Exclude<UserRole, 'admin'>,
  Partial<Record<ManualWorkflowStatus, ManualWorkflowStatus[]>>
> = {
  requester: {
    Submitted: ['Cancelled'],
    'Need More Information': ['Submitted', 'Cancelled'],
  },
  setup_owner: {
    Submitted: ['Setup In Progress', 'Need More Information', 'Rejected'],
    'Setup In Progress': ['PSF Created', 'Need More Information', 'Rejected'],
    'PSF Created': ['Completed', 'Need More Information'],
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class WorkflowTransitionService implements OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.ensureWorkflowTransitionStorage();
    await this.seedDefaultConfiguration();
  }

  async getConfiguration(
    queryRunner: QueryRunner = this.pool,
  ): Promise<WorkflowTransitionConfiguration> {
    const result = await queryRunner.query<WorkflowTransitionConfigurationRow>(
      `
        SELECT config_json
        FROM workflow_transition_config
        WHERE config_key = $1
      `,
      [WORKFLOW_TRANSITION_CONFIGURATION_KEY],
    );
    const storedConfiguration = result.rows[0];

    if (!storedConfiguration) {
      throw new ConflictException(
        'The workflow transition configuration has not been initialized.',
      );
    }

    return this.normalizeConfiguration(storedConfiguration.config_json);
  }

  async replaceConfiguration(
    input: unknown,
  ): Promise<WorkflowTransitionConfiguration> {
    const configuration = this.normalizeConfiguration(input);
    const persistedInput: WorkflowTransitionConfigurationInput = {
      transitions: configuration.transitions,
    };

    return this.withTransaction(async (client) => {
      const result = await client.query<WorkflowTransitionConfigurationRow>(
        `
          INSERT INTO workflow_transition_config (
            config_key,
            config_json,
            updated_at
          )
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (config_key) DO UPDATE
          SET config_json = EXCLUDED.config_json,
              updated_at = NOW()
          RETURNING config_json
        `,
        [WORKFLOW_TRANSITION_CONFIGURATION_KEY, persistedInput],
      );
      const savedConfiguration = result.rows[0];

      if (!savedConfiguration) {
        throw new ConflictException(
          'The workflow transition configuration could not be saved.',
        );
      }

      return this.normalizeConfiguration(savedConfiguration.config_json);
    });
  }

  async getAllowedNextStatuses(
    actor: AuthenticatedUserProfile,
    currentStatus: string,
    queryRunner: QueryRunner = this.pool,
  ): Promise<ManualWorkflowStatus[]> {
    if (
      currentStatus === DRAFT_STATUS ||
      !MANUAL_STATUS_SET.has(currentStatus)
    ) {
      return [];
    }

    const configuration = await this.getConfiguration(queryRunner);

    return configuration.transitions
      .filter(
        (transition) =>
          transition.enabled &&
          transition.fromStatus === currentStatus &&
          this.actorMatchesTransition(actor, transition),
      )
      .map((transition) => transition.toStatus);
  }

  private async ensureWorkflowTransitionStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_transition_config (
        config_key TEXT PRIMARY KEY,
        config_json JSONB NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);
  }

  private async seedDefaultConfiguration(): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO workflow_transition_config (
          config_key,
          config_json,
          updated_at
        )
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (config_key) DO NOTHING
      `,
      [WORKFLOW_TRANSITION_CONFIGURATION_KEY, this.defaultConfigurationInput()],
    );
  }

  private defaultConfigurationInput(): WorkflowTransitionConfigurationInput {
    return {
      transitions: this.expectedTransitionPairs().map(
        ({ fromStatus, toStatus }) => ({
          fromStatus,
          toStatus,
          enabled: true,
          allowedRoles: USER_ROLES.filter((role) =>
            this.isSeededRoleAllowed(role, fromStatus, toStatus),
          ),
          allowedSetupOwnerDepartments: [],
        }),
      ),
    };
  }

  private isSeededRoleAllowed(
    role: UserRole,
    fromStatus: ManualWorkflowStatus,
    toStatus: ManualWorkflowStatus,
  ): boolean {
    if (role === 'admin') {
      return true;
    }

    return (
      DEFAULT_STATUS_TRANSITIONS_BY_ROLE[role][fromStatus]?.includes(
        toStatus,
      ) ?? false
    );
  }

  private normalizeConfiguration(
    input: unknown,
  ): WorkflowTransitionConfiguration {
    if (!isRecord(input) || !Array.isArray(input.transitions)) {
      throw new BadRequestException('workflow transitions must be an array.');
    }

    this.assertOnlyKeys(input, ['transitions'], 'workflow configuration');

    const expectedPairs = this.expectedTransitionPairs();
    if (input.transitions.length !== expectedPairs.length) {
      throw new BadRequestException(
        'Every directed transition between manual statuses must be provided exactly once.',
      );
    }

    const transitionsByKey = new Map<string, WorkflowTransitionRule>();
    for (const transitionInput of input.transitions) {
      const transition = this.normalizeTransition(transitionInput);
      const key = this.transitionKey(
        transition.fromStatus,
        transition.toStatus,
      );

      if (transitionsByKey.has(key)) {
        throw new BadRequestException(
          'Each directed workflow transition may be configured only once.',
        );
      }

      transitionsByKey.set(key, transition);
    }

    const missingPair = expectedPairs.find(
      ({ fromStatus, toStatus }) =>
        !transitionsByKey.has(this.transitionKey(fromStatus, toStatus)),
    );
    if (missingPair) {
      throw new BadRequestException(
        'Every directed transition between manual statuses must be provided exactly once.',
      );
    }

    return {
      statuses: [...MANUAL_WORKFLOW_STATUSES],
      transitions: expectedPairs.map(({ fromStatus, toStatus }) => {
        const transition = transitionsByKey.get(
          this.transitionKey(fromStatus, toStatus),
        );

        if (!transition) {
          throw new ConflictException(
            'The workflow transition configuration is incomplete.',
          );
        }

        return transition;
      }),
    };
  }

  private normalizeTransition(input: unknown): WorkflowTransitionRule {
    if (!isRecord(input)) {
      throw new BadRequestException(
        'Every workflow transition must be an object.',
      );
    }

    this.assertOnlyKeys(
      input,
      [
        'fromStatus',
        'toStatus',
        'enabled',
        'allowedRoles',
        'allowedSetupOwnerDepartments',
      ],
      'workflow transition',
    );

    const fromStatus = this.parseManualStatus(input.fromStatus, 'fromStatus');
    const toStatus = this.parseManualStatus(input.toStatus, 'toStatus');
    if (fromStatus === toStatus) {
      throw new BadRequestException(
        'Workflow transitions cannot have the same source and target status.',
      );
    }

    if (typeof input.enabled !== 'boolean') {
      throw new BadRequestException(
        'workflow transition enabled must be boolean.',
      );
    }

    const allowedRoles = this.parseEnumArray(
      input.allowedRoles,
      USER_ROLES,
      USER_ROLE_SET,
      'allowedRoles',
    );
    const allowedSetupOwnerDepartments = this.parseEnumArray(
      input.allowedSetupOwnerDepartments,
      SETUP_OWNER_DEPARTMENTS,
      SETUP_OWNER_DEPARTMENT_SET,
      'allowedSetupOwnerDepartments',
    );

    if (
      input.enabled &&
      allowedRoles.length === 0 &&
      allowedSetupOwnerDepartments.length === 0
    ) {
      throw new BadRequestException(
        'Enabled workflow transitions must allow at least one role or Setup File Owner department.',
      );
    }

    return {
      fromStatus,
      toStatus,
      enabled: input.enabled,
      allowedRoles,
      allowedSetupOwnerDepartments,
    };
  }

  private parseManualStatus(
    value: unknown,
    fieldName: string,
  ): ManualWorkflowStatus {
    if (typeof value !== 'string' || !MANUAL_STATUS_SET.has(value)) {
      throw new BadRequestException(
        `${fieldName} must be a supported manual workflow status; Draft is submitted through the submit action.`,
      );
    }

    return value as ManualWorkflowStatus;
  }

  private parseEnumArray<T extends string>(
    value: unknown,
    orderedValues: readonly T[],
    supportedValues: Set<string>,
    fieldName: string,
  ): T[] {
    if (
      !Array.isArray(value) ||
      !value.every(
        (entry) => typeof entry === 'string' && supportedValues.has(entry),
      )
    ) {
      throw new BadRequestException(
        `${fieldName} must contain only supported values.`,
      );
    }

    const values = value as T[];
    if (new Set(values).size !== values.length) {
      throw new BadRequestException(
        `${fieldName} must not contain duplicates.`,
      );
    }

    const selectedValues = new Set(values);
    return orderedValues.filter((entry) => selectedValues.has(entry));
  }

  private assertOnlyKeys(
    value: Record<string, unknown>,
    supportedKeys: string[],
    label: string,
  ): void {
    const unsupportedKey = Object.keys(value).find(
      (key) => !supportedKeys.includes(key),
    );

    if (unsupportedKey) {
      throw new BadRequestException(
        `${label} contains an unsupported field: ${unsupportedKey}.`,
      );
    }
  }

  private expectedTransitionPairs(): Array<{
    fromStatus: ManualWorkflowStatus;
    toStatus: ManualWorkflowStatus;
  }> {
    return MANUAL_WORKFLOW_STATUSES.flatMap((fromStatus) =>
      MANUAL_WORKFLOW_STATUSES.filter(
        (toStatus) => toStatus !== fromStatus,
      ).map((toStatus) => ({ fromStatus, toStatus })),
    );
  }

  private actorMatchesTransition(
    actor: AuthenticatedUserProfile,
    transition: WorkflowTransitionRule,
  ): boolean {
    if (transition.allowedRoles.includes(actor.role)) {
      return true;
    }

    return (
      actor.role === 'setup_owner' &&
      actor.setupOwnerDepartment !== null &&
      transition.allowedSetupOwnerDepartments.includes(
        actor.setupOwnerDepartment,
      )
    );
  }

  private transitionKey(
    fromStatus: ManualWorkflowStatus,
    toStatus: ManualWorkflowStatus,
  ): string {
    return `${fromStatus}\u0000${toStatus}`;
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
      // Preserve the original configuration error if rollback also fails.
    }
  }
}
