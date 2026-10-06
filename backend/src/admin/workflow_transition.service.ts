import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import {
  AuditLogService,
  REQUEST_AUDIT_ACTION,
} from '../audit/audit_log.service';
import { DATABASE_POOL } from '../database/database.service';
import { resolvePsfCreatedInformationSchema } from './form_schema.constants';
import type { FormSchemaJson } from './form_schema.constants';
import { assertValidRequiredFormData } from '../requests/form-data-validation';
import type { StatusEmailPolicy } from '../notifications/notification.types';
import { NotificationService } from '../notifications/notification.service';

export type StatusKind = 'draft' | 'open' | 'completed' | 'cancelled';

export interface StatusCatalogEntry {
  id: string;
  name: string;
  kind: StatusKind;
  requestCount: number | null;
  emailPolicy: StatusEmailPolicy;
  psfAccessTrigger?: boolean;
}

export interface WorkflowConfiguration {
  statuses: string[];
  entries: StatusCatalogEntry[];
  psfVisibilityTriggerId: string | null;
  psfVisibilityTriggerIds?: string[];
  updatedAt: string;
}

export type WorkflowConfigurationOperation =
  | {
      action: 'create';
      name: string;
      kind: Exclude<StatusKind, 'draft'>;
      expectedUpdatedAt: string;
    }
  | {
      action: 'email-policy';
      id: string;
      emailPolicy: StatusEmailPolicy;
      expectedUpdatedAt: string;
    }
  | {
      action: 'rename';
      id: string;
      name: string;
      emailPolicy?: StatusEmailPolicy;
      psfAccessTrigger?: boolean;
      expectedUpdatedAt: string;
    }
  | {
      action: 'delete';
      id: string;
      replacementId?: string;
      replacementTriggerId?: string | null;
      expectedUpdatedAt: string;
    }
  | {
      action: 'settings';
      psfVisibilityTriggerId: string | null;
      expectedUpdatedAt: string;
    };

export type PublicWorkflowConfiguration = Omit<
  WorkflowConfiguration,
  'entries'
> & {
  entries: Array<Omit<StatusCatalogEntry, 'requestCount' | 'emailPolicy'>>;
};

interface WorkflowConfigurationRow {
  config_json: unknown;
  updated_at_version: string;
}

interface StoredStatus {
  id: string;
  name: string;
  kind: StatusKind;
  emailPolicy: StatusEmailPolicy;
}

interface StoredWorkflowConfiguration {
  entries: StoredStatus[];
  psfVisibilityTriggerIds: string[];
}

interface StatusCountRow {
  status: string;
  request_count: number;
}

interface ReplacementRequestRow {
  id: string;
  request_no: string;
  status: string;
  psf_created_data_json: Record<string, unknown>;
  psf_created_schema_snapshot_json: FormSchemaJson | null;
}

type QueryRunner = Pick<Pool | PoolClient, 'query'>;

const CONFIGURATION_KEY = 'status-catalog-v1';
const DRAFT_NAME = 'Draft';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPDATED_AT_SQL = `TO_CHAR(updated_at AT TIME ZONE current_setting('TIMEZONE') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const DEFAULT_ENTRIES: Array<Omit<StoredStatus, 'emailPolicy'>> = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Draft', kind: 'draft' },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: '5% -- Reject (Information not complete)',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: '10% -- Test Engineer Data Entry',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: '20% -- PSF File Creating',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: '30% -- Compare Old and New layout',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    name: '40% -- Feedback Requester(Layout mismatch)',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000007',
    name: '80% -- Wait for create DCC',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000008',
    name: '81% -- Edit Template Map (Bin62)',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000009',
    name: '82% -- Wait for sent Template Map',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-00000000000a',
    name: '83% -- Complete Excel probe pattern',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-00000000000b',
    name: '85 % -- Reject check list',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-00000000000c',
    name: '90% -- Wait for buyoff check list',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-00000000000d',
    name: '93% -- Provide test template map to EWFM\\Update auto FI script (ST Fab)',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-00000000000e',
    name: '95% -- Reject (Wrong site location and wafer map)',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-00000000000f',
    name: '99% -- Wait requestor Buyoff site location and wafer map',
    kind: 'open',
  },
  {
    id: '00000000-0000-4000-8000-000000000010',
    name: '100% -- Completed',
    kind: 'completed',
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    name: '0% -- Rejected (Cancel Request)',
    kind: 'cancelled',
  },
];

@Injectable()
export class WorkflowTransitionService implements OnModuleInit {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditLogService: AuditLogService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_transition_config (
        config_key TEXT PRIMARY KEY,
        config_json JSONB NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);
    await this.pool.query(
      `
        INSERT INTO workflow_transition_config (config_key, config_json, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (config_key) DO NOTHING
      `,
      [
        CONFIGURATION_KEY,
        {
          entries: DEFAULT_ENTRIES.map((entry) => ({
            ...entry,
            emailPolicy: disabledEmailPolicy(),
          })),
          psfVisibilityTriggerId: null,
        },
      ],
    );
  }

  async getConfiguration(
    queryRunner: QueryRunner = this.pool,
    includeCounts = true,
  ): Promise<WorkflowConfiguration> {
    return this.readConfiguration(queryRunner, includeCounts);
  }

  async getPublicConfiguration(
    queryRunner: QueryRunner = this.pool,
  ): Promise<PublicWorkflowConfiguration> {
    const configuration = await this.readConfiguration(queryRunner, false);
    return {
      ...configuration,
      entries: configuration.entries.map(({ id, name, kind }) => ({
        id,
        name,
        kind,
      })),
    };
  }

  async lockConfiguration(
    queryRunner: QueryRunner,
    mode: 'share' | 'update' = 'share',
  ): Promise<WorkflowConfiguration> {
    return this.readConfiguration(
      queryRunner,
      false,
      mode === 'update' ? 'FOR UPDATE' : 'FOR SHARE',
    );
  }

  async getAllowedNextStatuses(
    currentStatus: string,
    queryRunner: QueryRunner = this.pool,
  ): Promise<string[]> {
    const { entries } = await this.readConfiguration(queryRunner, false);
    return entries
      .filter((entry) => entry.kind !== 'draft' && entry.name !== currentStatus)
      .map((entry) => entry.name);
  }

  async applyOperation(
    input: unknown,
    actor: AuthenticatedUserProfile,
  ): Promise<WorkflowConfiguration> {
    const operation = this.parseOperation(input);
    return this.withTransaction(async (client) => {
      const before = await this.readConfiguration(client, false, 'FOR UPDATE');
      this.assertExpectedUpdatedAt(
        operation.expectedUpdatedAt,
        before.updatedAt,
      );
      const entries = before.entries.map(({ id, name, kind, emailPolicy }) => ({
        id,
        name,
        kind,
        emailPolicy,
      }));
      let triggerIds = [...(before.psfVisibilityTriggerIds ?? [])];
      const releasedRequestIds: string[] = [];
      let requestChanges: Array<{
        id: string;
        fromStatus: string;
        toStatus: string;
      }> = [];

      switch (operation.action) {
        case 'create': {
          this.assertAvailableName(operation.name, entries);
          entries.push({
            id: this.newStatusId(entries),
            name: operation.name,
            kind: operation.kind,
            emailPolicy: disabledEmailPolicy(),
          });
          break;
        }
        case 'email-policy': {
          const target = this.requireEntry(entries, operation.id);
          if (target.kind === 'draft' && operation.emailPolicy.enabled) {
            throw new BadRequestException(
              'Draft cannot enable email notifications.',
            );
          }
          target.emailPolicy = operation.emailPolicy;
          break;
        }
        case 'rename': {
          const target = this.requireEntry(entries, operation.id);
          if (target.kind === 'draft') {
            throw new BadRequestException('Draft cannot be renamed.');
          }
          this.assertAvailableName(operation.name, entries, target.id);
          if (operation.emailPolicy) target.emailPolicy = operation.emailPolicy;
          if (operation.psfAccessTrigger !== undefined) {
            triggerIds = triggerIds.filter((id) => id !== target.id);
            if (operation.psfAccessTrigger) {
              triggerIds.push(target.id);
              releasedRequestIds.push(
                ...(await this.releaseExistingRequests(client, target.name)),
              );
            }
          }
          const previousName = target.name;
          target.name = operation.name;
          if (previousName === operation.name) break;
          await client.query(
            'UPDATE psf_requests SET status = $2 WHERE status = $1',
            [previousName, operation.name],
          );
          await client.query(
            'UPDATE psf_request_search_index SET status = $2 WHERE status = $1',
            [previousName, operation.name],
          );
          break;
        }
        case 'settings': {
          if (operation.psfVisibilityTriggerId !== null) {
            const trigger = this.requireEntry(
              entries,
              operation.psfVisibilityTriggerId,
            );
            if (trigger.kind === 'draft') {
              throw new BadRequestException(
                'The PSF visibility trigger must be a work status.',
              );
            }
          }
          triggerIds =
            operation.psfVisibilityTriggerId === null
              ? []
              : [operation.psfVisibilityTriggerId];
          if (operation.psfVisibilityTriggerId !== null) {
            const trigger = this.requireEntry(
              entries,
              operation.psfVisibilityTriggerId,
            );
            releasedRequestIds.push(
              ...(await this.releaseExistingRequests(client, trigger.name)),
            );
          }
          break;
        }
        case 'delete': {
          const target = this.requireEntry(entries, operation.id);
          if (target.kind === 'draft') {
            throw new BadRequestException('Draft cannot be deleted.');
          }
          const replacement =
            operation.replacementId === undefined
              ? undefined
              : this.requireEntry(entries, operation.replacementId);
          if (replacement?.kind === 'draft' || replacement?.id === target.id) {
            throw new BadRequestException(
              'A different non-Draft replacement status is required.',
            );
          }
          if (triggerIds.includes(target.id)) {
            triggerIds = triggerIds.filter((id) => id !== target.id);
            if (
              operation.replacementTriggerId !== undefined &&
              operation.replacementTriggerId !== null
            ) {
              const replacementTrigger = this.requireEntry(
                entries,
                operation.replacementTriggerId,
              );
              if (
                replacementTrigger.kind === 'draft' ||
                replacementTrigger.id === target.id
              ) {
                throw new BadRequestException(
                  'The replacement trigger must be a surviving work status or null.',
                );
              }
              if (!triggerIds.includes(replacementTrigger.id))
                triggerIds.push(replacementTrigger.id);
              releasedRequestIds.push(
                ...(await this.releaseExistingRequests(
                  client,
                  replacementTrigger.name,
                )),
              );
            }
          } else if (Object.hasOwn(operation, 'replacementTriggerId')) {
            throw new BadRequestException(
              'replacementTriggerId is only valid when deleting the configured trigger.',
            );
          }

          const usedRequests = await client.query<ReplacementRequestRow>(
            `
              SELECT id, request_no, status, psf_created_data_json,
                     psf_created_schema_snapshot_json
              FROM psf_requests
              WHERE status = $1
              ORDER BY id
              FOR UPDATE
            `,
            [target.name],
          );
          if (usedRequests.rows.length > 0 && !replacement) {
            throw new BadRequestException(
              'A replacement status is required while requests use this status.',
            );
          }
          if (replacement && usedRequests.rows.length > 0) {
            const entersTrigger = triggerIds.includes(replacement.id);
            if (entersTrigger) {
              usedRequests.rows.forEach((request) =>
                assertValidRequiredFormData(
                  resolvePsfCreatedInformationSchema(
                    request.psf_created_schema_snapshot_json,
                  ),
                  request.psf_created_data_json ?? {},
                  'PSF Created Information',
                ),
              );
            }
            const previous = target.name;
            const result = await client.query<ReplacementRequestRow>(
              `
                UPDATE psf_requests
                SET status = $2,
                    completed_at = CASE WHEN $3::boolean AND status <> $2 THEN NOW() ELSE completed_at END,
                    psf_released_at = CASE WHEN $4::boolean THEN COALESCE(psf_released_at, NOW()) ELSE psf_released_at END,
                    updated_at = NOW()
                WHERE status = $1
                RETURNING id, request_no, status, psf_created_data_json,
                          psf_created_schema_snapshot_json
              `,
              [
                previous,
                replacement.name,
                replacement.kind === 'completed',
                entersTrigger,
              ],
            );
            requestChanges = result.rows.map((request) => ({
              id: request.id,
              fromStatus: previous,
              toStatus: replacement.name,
            }));
            const requestIds = requestChanges.map((change) => change.id);
            if (requestIds.length > 0) {
              await client.query(
                `
                  UPDATE psf_request_search_index AS search_entry
                  SET status = request.status, updated_at = request.updated_at
                  FROM psf_requests AS request
                  WHERE search_entry.request_id = request.id
                    AND request.id = ANY($1::uuid[])
                `,
                [requestIds],
              );
            }
            for (const change of requestChanges) {
              await this.auditLogService.record(
                {
                  requestId: change.id,
                  actionType: REQUEST_AUDIT_ACTION.REQUEST_STATUS_CHANGED,
                  actor,
                  metadata: {
                    fromStatus: change.fromStatus,
                    toStatus: change.toStatus,
                    bulkReplacement: true,
                  },
                },
                client,
              );
              await this.notificationService?.enqueueRequest(client, {
                eventType: 'REQUEST_STATUS_CHANGED',
                requestId: change.id,
                fromStatus: change.fromStatus,
                targetStatus: {
                  id: replacement.id,
                  name: replacement.name,
                  kind: replacement.kind,
                  emailPolicy: replacement.emailPolicy,
                },
                actor,
                bulkReplacement: true,
              });
            }
          }
          entries.splice(
            entries.findIndex((entry) => entry.id === target.id),
            1,
          );
          break;
        }
      }

      const after: StoredWorkflowConfiguration = {
        entries,
        psfVisibilityTriggerIds: entries
          .filter((entry) => triggerIds.includes(entry.id))
          .map((entry) => entry.id),
      };
      await this.persistConfiguration(
        client,
        operation.expectedUpdatedAt,
        after,
      );
      await this.auditLogService.record(
        {
          requestId: null,
          actionType: REQUEST_AUDIT_ACTION.WORKFLOW_CATALOG_UPDATED,
          actor,
          metadata: {
            operation: this.auditOperation(operation),
            before: this.toAuditConfiguration(before),
            after: this.toAuditConfiguration(after),
            affectedRequestCount: requestChanges.length,
            ...(releasedRequestIds.length
              ? {
                  releasedRequestCount: releasedRequestIds.length,
                  releasedRequestIds,
                }
              : {}),
          },
        },
        client,
      );
      return this.readConfiguration(client, true);
    });
  }

  private async releaseExistingRequests(
    client: PoolClient,
    status: string,
  ): Promise<string[]> {
    const requests = await client.query<ReplacementRequestRow>(
      `
      SELECT id, request_no, status, psf_created_data_json, psf_created_schema_snapshot_json
      FROM psf_requests
      WHERE status = $1 AND psf_released_at IS NULL
      ORDER BY id
      FOR UPDATE
    `,
      [status],
    );
    const invalid: string[] = [];
    for (const request of requests.rows) {
      try {
        assertValidRequiredFormData(
          resolvePsfCreatedInformationSchema(
            request.psf_created_schema_snapshot_json,
          ),
          request.psf_created_data_json ?? {},
          'PSF Created Information',
        );
      } catch (error) {
        invalid.push(
          `${request.request_no}: ${error instanceof Error ? error.message : 'Invalid PSF Created Information'}`,
        );
      }
    }
    if (invalid.length)
      throw new BadRequestException(
        `Cannot release PSF access. Fix these requests: ${invalid.join('; ')}`,
      );
    const ids = requests.rows.map((request) => request.id);
    if (ids.length === 0) return [];
    await client.query(
      `
      UPDATE psf_requests SET psf_released_at = NOW(), updated_at = NOW()
      WHERE id = ANY($1::uuid[]) AND psf_released_at IS NULL
    `,
      [ids],
    );
    await client.query(
      `
      UPDATE psf_request_search_index AS search_entry SET updated_at = request.updated_at
      FROM psf_requests AS request
      WHERE search_entry.request_id = request.id AND request.id = ANY($1::uuid[])
    `,
      [ids],
    );
    return ids;
  }

  private async readConfiguration(
    queryRunner: QueryRunner,
    includeCounts: boolean,
    lock?: 'FOR SHARE' | 'FOR UPDATE',
  ): Promise<WorkflowConfiguration> {
    const result = await queryRunner.query<WorkflowConfigurationRow>(
      `
        SELECT config_json, ${UPDATED_AT_SQL} AS updated_at_version
        FROM workflow_transition_config
        WHERE config_key = $1
        ${lock ?? ''}
      `,
      [CONFIGURATION_KEY],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ConflictException(
        'The workflow status catalog has not been initialized.',
      );
    }
    const stored = this.normalizeStoredConfiguration(row.config_json);
    const counts = new Map<string, number>();
    if (includeCounts) {
      const countResult = await queryRunner.query<StatusCountRow>(
        `SELECT status, COUNT(*)::int AS request_count FROM psf_requests GROUP BY status`,
      );
      countResult.rows.forEach((count) =>
        counts.set(count.status, Number(count.request_count)),
      );
    }
    return {
      statuses: stored.entries
        .filter((entry) => entry.kind !== 'draft')
        .map((entry) => entry.name),
      entries: stored.entries.map((entry) => ({
        ...entry,
        psfAccessTrigger: stored.psfVisibilityTriggerIds.includes(entry.id),
        requestCount:
          entry.kind === 'draft' || !includeCounts
            ? null
            : (counts.get(entry.name) ?? 0),
      })),
      psfVisibilityTriggerIds: stored.psfVisibilityTriggerIds,
      psfVisibilityTriggerId:
        stored.psfVisibilityTriggerIds.length === 1
          ? stored.psfVisibilityTriggerIds[0]
          : null,
      updatedAt: row.updated_at_version,
    };
  }

  private normalizeStoredConfiguration(
    input: unknown,
  ): StoredWorkflowConfiguration {
    if (!isRecord(input) || !Array.isArray(input.entries)) {
      throw new ConflictException(
        'The stored workflow status catalog is invalid.',
      );
    }
    const entries = input.entries.map((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== 'string' ||
        !this.isUuid(entry.id) ||
        typeof entry.name !== 'string' ||
        !this.isStatusKind(entry.kind)
      ) {
        throw new ConflictException(
          'The stored workflow status catalog is invalid.',
        );
      }
      let emailPolicy: StatusEmailPolicy;
      try {
        emailPolicy =
          entry.emailPolicy === undefined
            ? disabledEmailPolicy()
            : this.normalizeEmailPolicy(entry.emailPolicy);
      } catch {
        throw new ConflictException(
          'The stored workflow email policy is invalid.',
        );
      }
      if (entry.kind === 'draft') emailPolicy.enabled = false;
      return { id: entry.id, name: entry.name, kind: entry.kind, emailPolicy };
    });
    this.assertCatalogInvariants(entries);
    const triggerIds = Object.hasOwn(input, 'psfVisibilityTriggerIds')
      ? input.psfVisibilityTriggerIds
      : input.psfVisibilityTriggerId === null
        ? []
        : [input.psfVisibilityTriggerId];
    if (
      !Array.isArray(triggerIds) ||
      triggerIds.some(
        (id: unknown) =>
          typeof id !== 'string' ||
          !entries.some((entry) => entry.id === id && entry.kind !== 'draft'),
      )
    ) {
      throw new ConflictException(
        'The stored PSF visibility trigger is invalid.',
      );
    }
    return {
      entries,
      psfVisibilityTriggerIds: entries
        .filter((entry) => triggerIds.includes(entry.id))
        .map((entry) => entry.id),
    };
  }

  private parseOperation(input: unknown): WorkflowConfigurationOperation {
    if (!isRecord(input) || typeof input.action !== 'string') {
      throw new BadRequestException(
        'A supported workflow operation is required.',
      );
    }
    const action = input.action;
    const expectedUpdatedAt = input.expectedUpdatedAt;
    if (
      typeof expectedUpdatedAt !== 'string' ||
      expectedUpdatedAt.length === 0
    ) {
      throw new BadRequestException(
        'A valid expectedUpdatedAt value is required.',
      );
    }
    switch (action) {
      case 'create':
        this.assertOnlyKeys(input, [
          'action',
          'name',
          'kind',
          'expectedUpdatedAt',
        ]);
        if (
          typeof input.name !== 'string' ||
          !this.isBusinessKind(input.kind)
        ) {
          throw new BadRequestException(
            'create requires a name and an open, completed, or cancelled kind.',
          );
        }
        this.assertValidName(input.name);
        return {
          action,
          name: input.name,
          kind: input.kind,
          expectedUpdatedAt,
        };
      case 'email-policy':
        this.assertOnlyKeys(input, [
          'action',
          'id',
          'emailPolicy',
          'expectedUpdatedAt',
        ]);
        if (typeof input.id !== 'string' || !this.isUuid(input.id)) {
          throw new BadRequestException('email-policy requires a status id.');
        }
        return {
          action,
          id: input.id,
          emailPolicy: this.normalizeEmailPolicy(input.emailPolicy),
          expectedUpdatedAt,
        };
      case 'rename':
        this.assertOnlyKeys(input, [
          'action',
          'id',
          'name',
          'emailPolicy',
          'psfAccessTrigger',
          'expectedUpdatedAt',
        ]);
        if (
          typeof input.id !== 'string' ||
          !this.isUuid(input.id) ||
          typeof input.name !== 'string'
        ) {
          throw new BadRequestException(
            'rename requires a status id and name.',
          );
        }
        this.assertValidName(input.name);
        if (
          Object.hasOwn(input, 'psfAccessTrigger') &&
          typeof input.psfAccessTrigger !== 'boolean'
        ) {
          throw new BadRequestException('psfAccessTrigger must be a boolean.');
        }
        return {
          action,
          id: input.id,
          name: input.name,
          expectedUpdatedAt,
          ...(Object.hasOwn(input, 'emailPolicy')
            ? { emailPolicy: this.normalizeEmailPolicy(input.emailPolicy) }
            : {}),
          ...(Object.hasOwn(input, 'psfAccessTrigger')
            ? { psfAccessTrigger: input.psfAccessTrigger as boolean }
            : {}),
        };
      case 'delete':
        this.assertOnlyKeys(input, [
          'action',
          'id',
          'replacementId',
          'replacementTriggerId',
          'expectedUpdatedAt',
        ]);
        if (typeof input.id !== 'string' || !this.isUuid(input.id)) {
          throw new BadRequestException('delete requires a status id.');
        }
        if (
          input.replacementId !== undefined &&
          (typeof input.replacementId !== 'string' ||
            !this.isUuid(input.replacementId))
        ) {
          throw new BadRequestException('replacementId must be a status id.');
        }
        if (
          Object.hasOwn(input, 'replacementTriggerId') &&
          input.replacementTriggerId !== null &&
          (typeof input.replacementTriggerId !== 'string' ||
            !this.isUuid(input.replacementTriggerId))
        ) {
          throw new BadRequestException(
            'replacementTriggerId must be a status id or null.',
          );
        }
        return {
          action,
          id: input.id,
          ...(input.replacementId === undefined
            ? {}
            : { replacementId: input.replacementId }),
          ...(Object.hasOwn(input, 'replacementTriggerId')
            ? {
                replacementTriggerId: input.replacementTriggerId as
                  | string
                  | null,
              }
            : {}),
          expectedUpdatedAt,
        };
      case 'settings':
        this.assertOnlyKeys(input, [
          'action',
          'psfVisibilityTriggerId',
          'expectedUpdatedAt',
        ]);
        if (
          input.psfVisibilityTriggerId !== null &&
          (typeof input.psfVisibilityTriggerId !== 'string' ||
            !this.isUuid(input.psfVisibilityTriggerId))
        ) {
          throw new BadRequestException(
            'psfVisibilityTriggerId must be a status id or null.',
          );
        }
        return {
          action,
          psfVisibilityTriggerId: input.psfVisibilityTriggerId,
          expectedUpdatedAt,
        };
      default:
        throw new BadRequestException('Unsupported workflow operation.');
    }
  }

  private normalizeEmailPolicy(input: unknown): StatusEmailPolicy {
    if (
      !isRecord(input) ||
      typeof input.enabled !== 'boolean' ||
      !Array.isArray(input.to) ||
      !Array.isArray(input.cc)
    ) {
      throw new BadRequestException(
        'Email policy requires enabled, To and CC address lists.',
      );
    }
    this.assertOnlyKeys(input, ['enabled', 'to', 'cc']);
    const normalize = (addresses: unknown[]): string[] => {
      const result = new Set<string>();
      for (const address of addresses) {
        if (typeof address !== 'string' || /[\r\n]/.test(address)) {
          throw new BadRequestException(
            'Email recipients must be valid email addresses.',
          );
        }
        const normalized = address.trim().toLowerCase();
        if (!normalized) continue;
        if (
          normalized.length > 254 ||
          !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
            normalized,
          ) ||
          normalized.split('@')[0].length > 64 ||
          normalized
            .split('@')[1]
            .split('.')
            .some((label) => label.length > 63) ||
          normalized.startsWith('.') ||
          normalized.split('@')[0].endsWith('.') ||
          normalized.includes('..')
        ) {
          throw new BadRequestException(
            'Email recipients must be valid email addresses.',
          );
        }
        result.add(normalized);
      }
      return [...result];
    };
    const to = normalize(input.to);
    const toSet = new Set(to);
    const cc = normalize(input.cc).filter((address) => !toSet.has(address));
    if (input.enabled && to.length === 0) {
      throw new BadRequestException(
        'An enabled email policy requires at least one To recipient.',
      );
    }
    return { enabled: input.enabled, to, cc };
  }

  private async persistConfiguration(
    client: PoolClient,
    expectedUpdatedAt: string,
    configuration: StoredWorkflowConfiguration,
  ): Promise<void> {
    const result = await client.query(
      `
        UPDATE workflow_transition_config
        SET config_json = $2::jsonb, updated_at = clock_timestamp()
        WHERE config_key = $1
          AND updated_at = ($3::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
      `,
      [CONFIGURATION_KEY, configuration, expectedUpdatedAt],
    );
    if (result.rowCount !== 1) {
      throw new ConflictException(
        'The workflow status catalog changed. Reload and try again.',
      );
    }
  }

  private async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await operation(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original catalog failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private assertExpectedUpdatedAt(expected: string, actual: string): void {
    if (expected !== actual) {
      throw new ConflictException(
        'The workflow status catalog changed. Reload and try again.',
      );
    }
  }

  private assertValidName(name: string): void {
    if (
      !name.trim() ||
      name.trim().toLowerCase() === DRAFT_NAME.toLowerCase()
    ) {
      throw new BadRequestException(
        'Status names must be nonblank and Draft is reserved.',
      );
    }
  }

  private assertAvailableName(
    name: string,
    entries: StoredStatus[],
    exceptId?: string,
  ): void {
    this.assertValidName(name);
    if (
      entries.some(
        (entry) =>
          entry.id !== exceptId &&
          entry.name.trim().toLocaleLowerCase() ===
            name.trim().toLocaleLowerCase(),
      )
    ) {
      throw new BadRequestException(
        'A status with an ambiguous duplicate name already exists.',
      );
    }
  }

  private assertCatalogInvariants(entries: StoredStatus[]): void {
    if (
      entries.length < 1 ||
      entries[0]?.kind !== 'draft' ||
      entries[0]?.name !== DRAFT_NAME
    ) {
      throw new ConflictException(
        'Draft must remain the first protected status.',
      );
    }
    if (entries.filter((entry) => entry.kind === 'draft').length !== 1) {
      throw new ConflictException(
        'The workflow catalog must contain exactly one Draft status.',
      );
    }
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const entry of entries) {
      if (
        ids.has(entry.id) ||
        names.has(entry.name.trim().toLocaleLowerCase()) ||
        !entry.name.trim()
      ) {
        throw new ConflictException(
          'The stored workflow status catalog contains duplicate identities or names.',
        );
      }
      ids.add(entry.id);
      names.add(entry.name.trim().toLocaleLowerCase());
    }
  }

  private requireEntry(entries: StoredStatus[], id: string): StoredStatus {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Status id must be a UUID.');
    }
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw new BadRequestException('The selected status does not exist.');
    }
    return entry;
  }

  private newStatusId(entries: StoredStatus[]): string {
    const existing = new Set(entries.map((entry) => entry.id));
    let id: string;
    do {
      id = randomUUID();
    } while (existing.has(id));
    return id;
  }

  private isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  private isStatusKind(value: unknown): value is StatusKind {
    return (
      value === 'draft' ||
      value === 'open' ||
      value === 'completed' ||
      value === 'cancelled'
    );
  }

  private isBusinessKind(
    value: unknown,
  ): value is Exclude<StatusKind, 'draft'> {
    return value === 'open' || value === 'completed' || value === 'cancelled';
  }

  private assertOnlyKeys(
    value: Record<string, unknown>,
    supported: string[],
  ): void {
    const unexpected = Object.keys(value).find(
      (key) => !supported.includes(key),
    );
    if (unexpected) {
      throw new BadRequestException(
        `Workflow operation contains an unsupported field: ${unexpected}.`,
      );
    }
  }

  private auditOperation(
    operation: WorkflowConfigurationOperation,
  ): Record<string, unknown> {
    switch (operation.action) {
      case 'create':
        return {
          action: operation.action,
          name: operation.name,
          kind: operation.kind,
        };
      case 'email-policy':
        return {
          action: operation.action,
          id: operation.id,
          emailPolicy: operation.emailPolicy,
        };
      case 'rename':
        return {
          action: operation.action,
          id: operation.id,
          name: operation.name,
          ...(operation.emailPolicy
            ? { emailPolicy: operation.emailPolicy }
            : {}),
          ...(operation.psfAccessTrigger !== undefined
            ? { psfAccessTrigger: operation.psfAccessTrigger }
            : {}),
        };
      case 'delete':
        return {
          action: operation.action,
          id: operation.id,
          ...(operation.replacementId
            ? { replacementId: operation.replacementId }
            : {}),
          ...(Object.hasOwn(operation, 'replacementTriggerId')
            ? { replacementTriggerId: operation.replacementTriggerId }
            : {}),
        };
      case 'settings':
        return {
          action: operation.action,
          psfVisibilityTriggerId: operation.psfVisibilityTriggerId,
        };
    }
  }

  private toAuditConfiguration(
    value: WorkflowConfiguration | StoredWorkflowConfiguration,
  ): StoredWorkflowConfiguration {
    return {
      entries: value.entries.map(({ id, name, kind, emailPolicy }) => ({
        id,
        name,
        kind,
        emailPolicy,
      })),
      psfVisibilityTriggerIds: value.psfVisibilityTriggerIds ?? [],
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function disabledEmailPolicy(): StatusEmailPolicy {
  return { enabled: false, to: [], cc: [] };
}
