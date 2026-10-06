import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import {
  AuditLogService,
  REQUEST_AUDIT_ACTION,
  type RequestAuditHistoryEntry,
} from '../audit/audit_log.service';
import {
  FormSchemaJson,
  FormSchemaService,
} from '../admin/form_schema.service';
import {
  PSF_CREATED_INFORMATION_FORM_KEY,
  PSF_CREATED_INFORMATION_SCHEMA,
  resolvePsfCreatedInformationSchema,
} from '../admin/form_schema.constants';
import { WorkflowTransitionService } from '../admin/workflow_transition.service';
import { DATABASE_POOL } from '../database/database.service';
import { NotificationService } from '../notifications/notification.service';
import {
  RequestSearchFilters,
  RequestSearchResult,
  RequestScopeFilters,
  SearchIndexService,
} from './search-index.service';
import {
  assertValidRequiredFormData,
  validateAndNormalizeFormData,
} from './form-data-validation';

const PSF_REQUEST_FORM_KEY = 'psf-request';
const DRAFT_STATUS = 'Draft';

const REQUEST_UPDATED_AT_VERSION_SQL = `TO_CHAR(
  updated_at AT TIME ZONE current_setting('TIMEZONE') AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
)`;

type QueryRunner = Pick<Pool | PoolClient, 'query'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canActorViewPsfCreatedData(
  _status: string,
  actor?: Pick<AuthenticatedUserProfile, 'role'>,
  psfReleasedAt: Date | string | null = null,
): boolean {
  return (
    actor !== undefined &&
    (actor.role !== 'requester' ||
      (psfReleasedAt !== null && psfReleasedAt !== undefined))
  );
}

export { PSF_CREATED_INFORMATION_SCHEMA };

export type RequesterData = Record<string, unknown>;

export interface CreateDraftRequestDto {
  requester?: string;
  requesterData: RequesterData;
  setupOwnerUserId?: string | null;
}

export interface AssignableSetupOwner {
  id: string;
  displayName: string;
  setupOwnerDepartment: 'GNTC' | 'MFG';
}

export interface UpdateRequestAssignmentDto {
  setupOwnerUserId: string | null;
  expectedUpdatedAt: string;
}

type AssignmentSnapshot = Pick<
  PsfRequestResponse,
  'setupOwnerUserId' | 'setupOwner' | 'setupOwnerRole'
>;

export interface UpdateDraftRequesterDataDto {
  formVersion: number;
  setupOwnerUserId?: string | null;
  requesterData: RequesterData;
  expectedUpdatedAt: unknown;
}

export interface SubmitDraftRequestDto {
  formVersion: number;
  status: string;
  expectedUpdatedAt: unknown;
}

export interface UpgradeDraftSchemaDto {
  formVersion: number;
}

export interface UpdateRequestStatusBodyDto {
  status: string;
  expectedUpdatedAt: unknown;
}

export interface UpdateRequestStatusDto extends UpdateRequestStatusBodyDto {
  actor: AuthenticatedUserProfile;
}

export interface UpdatePsfCreatedDataBodyDto {
  expectedUpdatedAt?: unknown;
  psfCreatedData?: unknown;
}

export interface UpdatePsfCreatedDataDto {
  actor: AuthenticatedUserProfile;
  expectedUpdatedAt: unknown;
  psfCreatedData: unknown;
}

export interface RequestStatusOptionsResponse {
  allowedNextStatuses: string[];
}

export type RequestQueryDto = Omit<RequestSearchFilters, 'requesterUserId'> & {
  scope?: 'all' | 'related' | 'my-drafts';
  relation?: 'all' | 'created' | 'assigned' | 'department';
  workState?: 'all' | 'open' | 'overdue' | 'completed';
};

export interface PsfRequestResponse {
  id: string;
  requestNo: string;
  formKey: string;
  formVersion: number;
  status: string;
  requester: string | null;
  setupOwnerUserId: string | null;
  setupOwner: string | null;
  setupOwnerRole: string | null;
  productType: string | null;
  requesterData: RequesterData;
  psfCreatedData: RequesterData;
  psfCreatedDataVisible: boolean;
  canEditPsfCreatedData: boolean;
  canEditRequesterData: boolean;
  canSubmitDraft: boolean;
  requesterUserId: string | null;
  psfReleasedAt: string | null;
  psfCreatedInformationSchema: FormSchemaJson;
  schemaSnapshot: FormSchemaJson;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  psfCreatedAt: string | null;
  completedAt: string | null;
}

interface PsfRequestRow {
  id: string;
  request_no: string;
  form_key: string;
  form_version: number;
  status: string;
  requester: string | null;
  requester_user_id: string | null;
  setup_owner_user_id?: string | null;
  setup_owner: string | null;
  setup_owner_role: string | null;
  product_type: string | null;
  requester_data_json: RequesterData;
  psf_created_data_json: RequesterData;
  schema_snapshot_json: FormSchemaJson;
  psf_created_schema_snapshot_json?: FormSchemaJson | null;
  created_at: Date | string;
  updated_at: Date | string;
  updated_at_version?: string;
  submitted_at: Date | string | null;
  psf_created_at: Date | string | null;
  psf_released_at: Date | string | null;
  completed_at: Date | string | null;
}

@Injectable()
export class RequestsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly formSchemaService: FormSchemaService,
    private readonly workflowTransitionService: WorkflowTransitionService,
    private readonly searchIndexService: SearchIndexService,
    private readonly auditLogService: AuditLogService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.withTransaction(async (client) => {
      await this.ensureRequestsStorage(client);
      await this.searchIndexService.ensureRequestSearchIndexStorage(client);
    });
  }

  async createDraft(
    dto: CreateDraftRequestDto,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    const activeSchema =
      await this.formSchemaService.getActiveSchema(PSF_REQUEST_FORM_KEY);
    const requester = actor.displayName;
    const requesterData = this.withServerRequesterIdentity(
      validateAndNormalizeFormData(activeSchema.schema, dto.requesterData, {
        allowMissingRequired: true,
      }),
      requester,
    );

    return this.withTransaction(async (client) => {
      const psfCreatedSchema =
        await this.formSchemaService.getActiveSchemaForUpdate(
          PSF_CREATED_INFORMATION_FORM_KEY,
          client,
        );
      const assignment =
        dto.setupOwnerUserId === undefined
          ? this.emptyAssignment()
          : await this.resolveAssignment(dto.setupOwnerUserId, client);
      const requestNo = await this.nextDraftRequestNo(client);
      const productType = this.normalizeString(requesterData.product_type);
      const result = await client.query<PsfRequestRow>(
        `
          INSERT INTO psf_requests (
            id,
            request_no,
            form_key,
            form_version,
            status,
            requester,
            requester_user_id,
            product_type,
            requester_data_json,
            psf_created_data_json,
            schema_snapshot_json,
            psf_created_schema_snapshot_json,
            setup_owner_user_id, setup_owner, setup_owner_role,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8, $9::jsonb, '{}'::jsonb, $10::jsonb, $11::jsonb, $12::uuid, $13, $14, NOW(), NOW())
          RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        `,
        [
          randomUUID(),
          requestNo,
          activeSchema.formKey,
          activeSchema.version,
          DRAFT_STATUS,
          requester,
          actor.id,
          productType,
          requesterData,
          activeSchema.schema,
          psfCreatedSchema.schema,
          assignment.setupOwnerUserId,
          assignment.setupOwner,
          assignment.setupOwnerRole,
        ],
      );

      const createdRow = result.rows[0];
      await this.auditLogService.record(
        {
          requestId: createdRow.id,
          actionType: REQUEST_AUDIT_ACTION.DRAFT_CREATED,
          actor,
          metadata: {},
        },
        client,
      );

      return this.mapRequestRow(createdRow, actor);
    });
  }

  async listAssignableSetupOwners(): Promise<{
    items: AssignableSetupOwner[];
  }> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      setup_owner_department: 'GNTC' | 'MFG';
    }>(
      `SELECT id, display_name, setup_owner_department FROM app_users
       WHERE role = 'setup_owner' AND setup_owner_department IN ('GNTC', 'MFG')
       ORDER BY display_name, id`,
    );
    return {
      items: result.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        setupOwnerDepartment: row.setup_owner_department,
      })),
    };
  }

  async updateAssignment(
    id: string,
    dto: UpdateRequestAssignmentDto,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    this.assertExpectedUpdatedAt(dto?.expectedUpdatedAt);
    if (!dto || !Object.hasOwn(dto, 'setupOwnerUserId')) {
      throw new BadRequestException('setupOwnerUserId is required.');
    }
    return this.withTransaction(async (client) => {
      const current = await client.query<PsfRequestRow>(
        `SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version FROM psf_requests WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const request = current.rows[0];
      if (!request)
        throw new NotFoundException(`PSF request ${id} was not found`);
      this.assertCanAccessRequest(request, actor);
      if (request.updated_at_version !== dto.expectedUpdatedAt) {
        throw new ConflictException(
          'The request changed before assignment. Reload and try again.',
        );
      }
      const before = this.assignmentSnapshot(request);
      const after = await this.resolveAssignment(dto.setupOwnerUserId, client);
      if (this.sameAssignment(before, after))
        return this.mapRequestRow(request, actor);
      const result = await client.query<PsfRequestRow>(
        `UPDATE psf_requests SET setup_owner_user_id = $2::uuid, setup_owner = $3, setup_owner_role = $4,
          updated_at = GREATEST(clock_timestamp() AT TIME ZONE current_setting('TIMEZONE'), updated_at + INTERVAL '1 microsecond')
         WHERE id = $1 AND updated_at = ($5::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
         RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version`,
        [
          id,
          after.setupOwnerUserId,
          after.setupOwner,
          after.setupOwnerRole,
          dto.expectedUpdatedAt,
        ],
      );
      const updated = result.rows[0];
      if (!updated)
        throw new ConflictException(
          'The request changed during assignment. Reload and try again.',
        );
      if (updated.status !== DRAFT_STATUS) {
        await this.searchIndexService.upsertRequestSearchIndex(
          {
            requestId: updated.id,
            requestNo: updated.request_no,
            status: updated.status,
            requester: updated.requester,
            requesterUserId: updated.requester_user_id,
            setupOwnerUserId: updated.setup_owner_user_id ?? null,
            setupOwner: updated.setup_owner,
            setupOwnerRole: updated.setup_owner_role,
            productType: updated.product_type,
            requestDate: updated.created_at,
            updatedAt: updated.updated_at_version ?? updated.updated_at,
          },
          this.searchIndexService.extractCanonicalValues(
            updated.schema_snapshot_json,
            updated.requester_data_json ?? {},
          ),
          client,
        );
      }
      await this.recordAssignmentChange(id, before, after, actor, client);
      return this.mapRequestRow(updated, actor);
    });
  }

  private emptyAssignment(): AssignmentSnapshot {
    return { setupOwnerUserId: null, setupOwner: null, setupOwnerRole: null };
  }

  private assignmentSnapshot(row: PsfRequestRow): AssignmentSnapshot {
    return {
      setupOwnerUserId: row.setup_owner_user_id ?? null,
      setupOwner: row.setup_owner,
      setupOwnerRole: row.setup_owner_role,
    };
  }

  private sameAssignment(
    before: AssignmentSnapshot,
    after: AssignmentSnapshot,
  ): boolean {
    return (
      before.setupOwnerUserId === after.setupOwnerUserId &&
      before.setupOwner === after.setupOwner &&
      before.setupOwnerRole === after.setupOwnerRole
    );
  }

  private async resolveAssignment(
    value: unknown,
    client: QueryRunner,
  ): Promise<AssignmentSnapshot> {
    if (value === null) return this.emptyAssignment();
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException('setupOwnerUserId must be a UUID or null.');
    }
    // FOR SHARE blocks role/department updates until this request mutation commits.
    const result = await client.query<{
      id: string;
      display_name: string;
      role: string;
      setup_owner_department: string | null;
    }>(
      `SELECT id, display_name, role, setup_owner_department FROM app_users WHERE id = $1::uuid FOR SHARE`,
      [value],
    );
    const user = result.rows[0];
    if (
      !user ||
      user.role !== 'setup_owner' ||
      (user.setup_owner_department !== 'GNTC' &&
        user.setup_owner_department !== 'MFG')
    ) {
      throw new BadRequestException(
        'The assignee must be an eligible Setup File Owner. Select another user or clear the assignment.',
      );
    }
    return {
      setupOwnerUserId: user.id,
      setupOwner: user.display_name,
      setupOwnerRole: user.setup_owner_department,
    };
  }

  private async recordAssignmentChange(
    id: string,
    before: AssignmentSnapshot,
    after: AssignmentSnapshot,
    actor: AuthenticatedUserProfile,
    client: QueryRunner,
  ): Promise<void> {
    await this.auditLogService.record(
      {
        requestId: id,
        actionType: REQUEST_AUDIT_ACTION.REQUEST_ASSIGNEE_CHANGED,
        actor,
        metadata: { before, after },
      },
      client,
    );
  }

  async queryRequests(
    query: RequestQueryDto,
    actor: AuthenticatedUserProfile,
  ): Promise<RequestSearchResult> {
    const filters = { ...(query as RequestSearchFilters) };
    delete filters.requesterUserId;

    const normalizedFilters = {
      ...filters,
      limit: this.parseOptionalNumber(query.limit),
      offset: this.parseOptionalNumber(query.offset),
    };

    const scope = query.scope ?? 'all';
    const relation = query.relation ?? 'all';
    const workState = query.workState ?? 'all';
    if (scope === 'my-drafts') {
      if (relation !== 'all' || workState !== 'all') {
        throw new BadRequestException(
          'My drafts cannot be combined with relationship or work-state filters.',
        );
      }
      return this.searchIndexService.queryOwnDrafts(
        actor.id,
        normalizedFilters,
      );
    }
    if (scope === 'all' && relation !== 'all') {
      throw new BadRequestException(
        'Relationship filters are only supported for related work.',
      );
    }
    if (
      scope === 'related' &&
      relation === 'department' &&
      actor.role !== 'setup_owner'
    ) {
      throw new ForbiddenException(
        'Only Setup File Owners can view PSF department work.',
      );
    }
    const configuration = await this.workflowTransitionService.getConfiguration(
      this.pool,
      false,
    );
    const workEntries = configuration.entries.filter(
      (entry) => entry.kind !== 'draft',
    );
    const scopeFilters: RequestScopeFilters = {
      scope,
      relation,
      workState,
      actorId: actor.id,
      actorRole: actor.role,
      department: actor.setupOwnerDepartment,
      openStatuses: workEntries
        .filter((entry) => entry.kind === 'open')
        .map((entry) => entry.name),
      completedStatuses: workEntries
        .filter((entry) => entry.kind === 'completed')
        .map((entry) => entry.name),
    };
    return this.searchIndexService.queryRequests(
      normalizedFilters,
      scopeFilters,
    );
  }

  async getRequest(
    id: string,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    const result = await this.pool.query<PsfRequestRow>(
      `
        SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        FROM psf_requests
        WHERE id = $1
      `,
      [id],
    );

    const request = result.rows[0];
    if (!request) {
      throw new NotFoundException(`PSF request ${id} was not found`);
    }

    this.assertCanAccessRequest(request, actor);

    return this.mapRequestRow(request, actor);
  }

  async getRequestHistory(
    id: string,
    actor: AuthenticatedUserProfile,
  ): Promise<RequestAuditHistoryEntry[]> {
    const request = await this.getRequest(id, actor);
    return this.auditLogService.findByRequestId(
      id,
      request.psfCreatedDataVisible,
    );
  }

  async getAllowedStatusTransitions(
    id: string,
    actor: AuthenticatedUserProfile,
  ): Promise<RequestStatusOptionsResponse> {
    const current = await this.pool.query<
      Pick<PsfRequestRow, 'id' | 'status' | 'requester_user_id'>
    >(
      `
        SELECT id, status, requester_user_id
        FROM psf_requests
        WHERE id = $1
      `,
      [id],
    );

    const request = current.rows[0];
    if (!request) {
      throw new NotFoundException(`PSF request ${id} was not found`);
    }

    this.assertCanAccessRequest(request, actor);

    return {
      allowedNextStatuses:
        await this.workflowTransitionService.getAllowedNextStatuses(
          request.status,
        ),
    };
  }

  async updateDraftRequesterData(
    id: string,
    dto: UpdateDraftRequesterDataDto,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    this.assertExpectedFormVersion(dto.formVersion);
    this.assertExpectedUpdatedAt(dto.expectedUpdatedAt);

    return this.withTransaction(async (client) => {
      const current = await client.query<PsfRequestRow>(
        `
          SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
          FROM psf_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

      const request = current.rows[0];
      if (!request) {
        throw new NotFoundException(`PSF request ${id} was not found`);
      }

      this.assertCanAccessRequest(request, actor);
      if (request.form_version !== dto.formVersion) {
        throw new ConflictException(
          'The request schema changed before these edits were saved. Reload the request and try again.',
        );
      }
      if (dto.expectedUpdatedAt !== request.updated_at_version) {
        throw new ConflictException(
          'The request changed before these edits were saved. Reload and try again.',
        );
      }

      if (
        request.status !== DRAFT_STATUS &&
        dto.setupOwnerUserId !== undefined
      ) {
        throw new BadRequestException(
          'Use the assignment endpoint for submitted requests.',
        );
      }
      const beforeAssignment = this.assignmentSnapshot(request);
      const assignment =
        dto.setupOwnerUserId === undefined
          ? beforeAssignment
          : await this.resolveAssignment(dto.setupOwnerUserId, client);
      const requesterIdentity = this.getServerRequesterIdentity(request, actor);
      const requesterData = this.withServerRequesterIdentity(
        validateAndNormalizeFormData(
          request.schema_snapshot_json,
          dto.requesterData,
          {
            allowMissingRequired: request.status === DRAFT_STATUS,
          },
        ),
        requesterIdentity.displayName,
      );
      const productType = this.normalizeString(requesterData.product_type);
      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET product_type = $2,
              requester_data_json = $3::jsonb,
              ${dto.setupOwnerUserId === undefined ? '' : 'setup_owner_user_id = $6::uuid, setup_owner = $7, setup_owner_role = $8,'}
              updated_at = NOW()
          WHERE id = $1
            AND form_version = $4
            AND updated_at = ($5::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
          RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        `,
        [
          id,
          productType,
          requesterData,
          dto.formVersion,
          dto.expectedUpdatedAt,
          ...(dto.setupOwnerUserId === undefined
            ? []
            : [
                assignment.setupOwnerUserId,
                assignment.setupOwner,
                assignment.setupOwnerRole,
              ]),
        ],
      );

      const updatedRow = result.rows[0];
      if (!updatedRow) {
        throw new ConflictException(
          'The request changed while these edits were being saved. Reload and try again.',
        );
      }
      if (request.status !== DRAFT_STATUS) {
        const canonicalValues =
          await this.searchIndexService.upsertSubmittedCanonicalValues(
            id,
            request.schema_snapshot_json,
            requesterData,
            client,
          );
        await this.searchIndexService.upsertRequestSearchIndex(
          {
            requestId: updatedRow.id,
            requestNo: updatedRow.request_no,
            status: updatedRow.status,
            requester: updatedRow.requester,
            requesterUserId: updatedRow.requester_user_id,
            setupOwnerUserId: updatedRow.setup_owner_user_id ?? null,
            setupOwner: updatedRow.setup_owner,
            setupOwnerRole: updatedRow.setup_owner_role,
            productType: updatedRow.product_type,
            requestDate: updatedRow.created_at,
            updatedAt: updatedRow.updated_at,
          },
          canonicalValues,
          client,
        );
      }
      await this.auditLogService.record(
        {
          requestId: updatedRow.id,
          actionType:
            request.status === DRAFT_STATUS
              ? REQUEST_AUDIT_ACTION.DRAFT_REQUESTER_DATA_UPDATED
              : REQUEST_AUDIT_ACTION.REQUESTER_INFORMATION_UPDATED,
          actor,
          metadata: {
            fieldChanges: this.getFieldChanges(
              request.schema_snapshot_json,
              request.requester_data_json ?? {},
              requesterData,
            ),
          },
        },
        client,
      );

      if (!this.sameAssignment(beforeAssignment, assignment)) {
        await this.recordAssignmentChange(
          updatedRow.id,
          beforeAssignment,
          assignment,
          actor,
          client,
        );
      }
      return this.mapRequestRow(updatedRow, actor);
    });
  }

  async upgradeDraftSchema(
    id: string,
    dto: UpgradeDraftSchemaDto,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    this.assertExpectedFormVersion(dto.formVersion);

    return this.withTransaction(async (client) => {
      const current = await client.query<
        Pick<
          PsfRequestRow,
          | 'id'
          | 'form_key'
          | 'form_version'
          | 'status'
          | 'requester'
          | 'requester_user_id'
          | 'requester_data_json'
          | 'schema_snapshot_json'
        >
      >(
        `
          SELECT
            id,
            form_key,
            form_version,
            status,
            requester,
            requester_user_id,
            requester_data_json,
            schema_snapshot_json
          FROM psf_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

      const request = current.rows[0];
      if (!request) {
        throw new NotFoundException(`PSF request ${id} was not found`);
      }

      this.assertCanAccessRequest(request, actor);

      if (request.status !== DRAFT_STATUS) {
        throw new ForbiddenException(
          'Only Draft requests can be upgraded to the active schema',
        );
      }

      if (!this.requestSchemaSnapshotMatchesVersion(request)) {
        throw new ConflictException(
          'This Draft schema snapshot is inconsistent. Reload the request and try again.',
        );
      }

      if (request.form_key !== PSF_REQUEST_FORM_KEY) {
        throw new ConflictException(
          'This Draft does not use the managed PSF request schema. Reload the request and try again.',
        );
      }

      const activeSchema =
        await this.formSchemaService.getActiveSchemaForUpdate(
          PSF_REQUEST_FORM_KEY,
          client,
        );
      if (activeSchema.version !== dto.formVersion) {
        throw new ConflictException(
          'The active request schema changed before this upgrade. Reload the Draft and try again.',
        );
      }

      if (request.form_version >= activeSchema.version) {
        throw new ConflictException(
          'This Draft is not based on an older active schema version. Reload the Draft and try again.',
        );
      }

      const requesterIdentity = this.getServerRequesterIdentity(request, actor);
      const requesterData = this.withServerRequesterIdentity(
        this.normalizeRequesterDataToSchema(
          activeSchema.schema,
          request.requester_data_json ?? {},
          true,
        ),
        requesterIdentity.displayName,
      );
      const productType = this.normalizeString(requesterData.product_type);
      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET requester = $2,
              requester_user_id = $3::uuid,
              product_type = $4,
              requester_data_json = $5::jsonb,
              form_version = $6,
              schema_snapshot_json = $7::jsonb,
              updated_at = NOW()
          WHERE id = $1
            AND status = '${DRAFT_STATUS}'
            AND form_version = $8
          RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        `,
        [
          id,
          requesterIdentity.displayName,
          requesterIdentity.userId,
          productType,
          requesterData,
          activeSchema.version,
          activeSchema.schema,
          request.form_version,
        ],
      );
      const upgradedRow = result.rows[0];
      if (!upgradedRow) {
        throw new ConflictException(
          'The Draft changed before its schema could be upgraded. Reload the Draft and try again.',
        );
      }

      await this.auditLogService.record(
        {
          requestId: upgradedRow.id,
          actionType: REQUEST_AUDIT_ACTION.DRAFT_REQUESTER_DATA_UPDATED,
          actor,
          metadata: {
            fromFormVersion: request.form_version,
            toFormVersion: activeSchema.version,
          },
        },
        client,
      );

      return this.mapRequestRow(upgradedRow, actor);
    });
  }

  async updatePsfCreatedData(
    id: string,
    dto: UpdatePsfCreatedDataDto,
  ): Promise<PsfRequestResponse> {
    this.assertCanEditPsfCreatedData(dto.actor);
    this.assertPsfCreatedDataPayload(dto.psfCreatedData);
    this.assertExpectedUpdatedAt(dto.expectedUpdatedAt);

    return this.withTransaction(async (client) => {
      const current = await client.query<PsfRequestRow>(
        `SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version FROM psf_requests WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const request = current.rows[0];
      if (!request) {
        throw new NotFoundException(`PSF request ${id} was not found`);
      }
      this.assertCanAccessRequest(request, dto.actor);
      if (dto.expectedUpdatedAt !== request.updated_at_version) {
        throw new ConflictException(
          'The request changed before this update. Reload and try again.',
        );
      }
      const schema = resolvePsfCreatedInformationSchema(
        request.psf_created_schema_snapshot_json,
      );
      const psfCreatedData = validateAndNormalizeFormData(
        schema,
        dto.psfCreatedData,
        {
          allowMissingRequired: request.status === DRAFT_STATUS,
        },
      );
      const hasPsfData = Object.values(psfCreatedData).some(
        (value) => typeof value === 'string' && value.trim().length > 0,
      );
      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET psf_created_data_json = $2::jsonb,
              psf_created_at = CASE WHEN $3::boolean THEN COALESCE(psf_created_at, NOW()) ELSE psf_created_at END,
              updated_at = NOW()
          WHERE id = $1
            AND updated_at = ($4::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
          RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        `,
        [id, psfCreatedData, hasPsfData, dto.expectedUpdatedAt],
      );
      const updatedRow = result.rows[0];
      if (!updatedRow) {
        throw new ConflictException(
          'The request changed before this update. Reload and try again.',
        );
      }
      if (updatedRow.status !== DRAFT_STATUS) {
        await this.searchIndexService.upsertRequestSearchIndex(
          {
            requestId: updatedRow.id,
            requestNo: updatedRow.request_no,
            status: updatedRow.status,
            requester: updatedRow.requester,
            requesterUserId: updatedRow.requester_user_id,
            setupOwnerUserId: updatedRow.setup_owner_user_id ?? null,
            setupOwner: updatedRow.setup_owner,
            setupOwnerRole: updatedRow.setup_owner_role,
            productType: updatedRow.product_type,
            requestDate: updatedRow.created_at,
            updatedAt: updatedRow.updated_at,
          },
          this.searchIndexService.extractCanonicalValues(
            updatedRow.schema_snapshot_json,
            updatedRow.requester_data_json ?? {},
          ),
          client,
        );
      }
      await this.auditLogService.record(
        {
          requestId: updatedRow.id,
          actionType: REQUEST_AUDIT_ACTION.PSF_CREATED_INFORMATION_UPDATED,
          actor: dto.actor,
          metadata: {
            fieldChanges: this.getFieldChanges(
              schema,
              request.psf_created_data_json ?? {},
              psfCreatedData,
            ),
          },
        },
        client,
      );
      return this.mapRequestRow(updatedRow, dto.actor);
    });
  }

  async updateRequestStatus(
    id: string,
    dto: UpdateRequestStatusDto,
  ): Promise<PsfRequestResponse> {
    this.assertExpectedUpdatedAt(dto.expectedUpdatedAt);
    return this.withTransaction(async (client) => {
      const configuration =
        await this.workflowTransitionService.lockConfiguration(client);
      const current = await client.query<PsfRequestRow>(
        `
          SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
          FROM psf_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

      const currentRequest = current.rows[0];
      if (!currentRequest) {
        throw new NotFoundException(`PSF request ${id} was not found`);
      }

      this.assertCanAccessRequest(currentRequest, dto.actor);
      if (currentRequest.status === DRAFT_STATUS) {
        throw new ForbiddenException(
          'Draft requests must be submitted through the submit action.',
        );
      }
      if (currentRequest.updated_at_version !== dto.expectedUpdatedAt) {
        throw new ConflictException(
          'The request changed before this status update. Reload and try again.',
        );
      }
      const target = configuration.entries.find(
        (entry) => entry.name === dto.status && entry.kind !== 'draft',
      );
      if (!target) {
        throw new BadRequestException(
          `Unsupported request status: ${dto.status}`,
        );
      }
      if (target.name === currentRequest.status) {
        return this.mapRequestRow(currentRequest, dto.actor);
      }
      const entersTrigger = (
        configuration.psfVisibilityTriggerIds ?? [
          configuration.psfVisibilityTriggerId,
        ]
      ).includes(target.id);
      if (entersTrigger) {
        assertValidRequiredFormData(
          resolvePsfCreatedInformationSchema(
            currentRequest.psf_created_schema_snapshot_json,
          ),
          currentRequest.psf_created_data_json ?? {},
          'PSF Created Information',
        );
      }

      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET status = $2,
              completed_at = CASE WHEN $3::boolean THEN NOW() ELSE completed_at END,
              psf_released_at = CASE WHEN $4::boolean THEN COALESCE(psf_released_at, NOW()) ELSE psf_released_at END,
              updated_at = NOW()
          WHERE id = $1
            AND status = $5
            AND updated_at = ($6::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
          RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        `,
        [
          id,
          target.name,
          target.kind === 'completed',
          entersTrigger,
          currentRequest.status,
          dto.expectedUpdatedAt,
        ],
      );

      const updatedRow = result.rows[0];
      if (!updatedRow) {
        throw new ConflictException(
          'The request status changed before this update. Reload the request and try again.',
        );
      }

      await this.searchIndexService.upsertRequestSearchIndex(
        {
          requestId: updatedRow.id,
          requestNo: updatedRow.request_no,
          status: updatedRow.status,
          requester: updatedRow.requester,
          requesterUserId: updatedRow.requester_user_id,
          setupOwnerUserId: updatedRow.setup_owner_user_id ?? null,
          setupOwner: updatedRow.setup_owner,
          setupOwnerRole: updatedRow.setup_owner_role,
          productType: updatedRow.product_type,
          requestDate: updatedRow.created_at,
          updatedAt: updatedRow.updated_at,
        },
        this.searchIndexService.extractCanonicalValues(
          updatedRow.schema_snapshot_json,
          updatedRow.requester_data_json,
        ),
        client,
      );

      await this.auditLogService.record(
        {
          requestId: updatedRow.id,
          actionType: REQUEST_AUDIT_ACTION.REQUEST_STATUS_CHANGED,
          actor: dto.actor,
          metadata: {
            fromStatus: currentRequest.status,
            toStatus: updatedRow.status,
          },
        },
        client,
      );

      await this.notificationService?.enqueueRequest(client, {
        eventType: 'REQUEST_STATUS_CHANGED',
        requestId: updatedRow.id,
        fromStatus: currentRequest.status,
        targetStatus: target,
        actor: dto.actor,
      });

      return this.mapRequestRow(updatedRow, dto.actor);
    });
  }

  async submitRequest(
    id: string,
    dto: SubmitDraftRequestDto,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    this.assertExpectedFormVersion(dto.formVersion);
    this.assertExpectedUpdatedAt(dto.expectedUpdatedAt);

    return this.withTransaction(async (client) => {
      const configuration =
        await this.workflowTransitionService.lockConfiguration(client);
      const target = configuration.entries.find(
        (entry) => entry.name === dto.status && entry.kind !== 'draft',
      );
      if (!target) {
        throw new BadRequestException(
          'Submission requires an explicit non-Draft catalog status.',
        );
      }

      const current = await client.query<PsfRequestRow>(
        `
          SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
          FROM psf_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

      const request = current.rows[0];
      if (!request) {
        throw new NotFoundException(`PSF request ${id} was not found`);
      }

      this.assertCanAccessRequest(request, actor);

      if (request.status !== DRAFT_STATUS) {
        throw new ForbiddenException('Only Draft requests can be submitted');
      }
      if (request.updated_at_version !== dto.expectedUpdatedAt) {
        throw new ConflictException(
          'The request changed before submission. Reload and try again.',
        );
      }

      if (request.setup_owner_user_id) {
        await this.resolveAssignment(request.setup_owner_user_id, client);
      }

      if (!this.requestSchemaSnapshotMatchesVersion(request)) {
        throw new ConflictException(
          'This Draft schema snapshot is inconsistent. Reload the Draft and try again.',
        );
      }

      const activeSchema =
        await this.formSchemaService.getActiveSchemaForUpdate(
          PSF_REQUEST_FORM_KEY,
          client,
        );
      if (request.form_version !== activeSchema.version) {
        throw new ConflictException(
          'This Draft uses an older or inconsistent schema version. Explicitly upgrade the Draft before submitting.',
        );
      }
      if (activeSchema.version !== dto.formVersion) {
        throw new BadRequestException(
          'The active request schema changed before submit. Reload the draft and submit again.',
        );
      }
      const requesterIdentity = this.getServerRequesterIdentity(request, actor);
      const normalizedRequesterData = this.withServerRequesterIdentity(
        validateAndNormalizeFormData(
          request.schema_snapshot_json,
          request.requester_data_json ?? {},
          {
            allowMissingRequired: false,
          },
        ),
        requesterIdentity.displayName,
      );
      const entersTrigger = (
        configuration.psfVisibilityTriggerIds ?? [
          configuration.psfVisibilityTriggerId,
        ]
      ).includes(target.id);
      if (entersTrigger) {
        assertValidRequiredFormData(
          resolvePsfCreatedInformationSchema(
            request.psf_created_schema_snapshot_json,
          ),
          request.psf_created_data_json ?? {},
          'PSF Created Information',
        );
      }

      const productType = this.normalizeString(
        normalizedRequesterData.product_type,
      );
      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET status = $2,
              product_type = $3,
              requester_data_json = $4::jsonb,
              submitted_at = NOW(),
              completed_at = CASE WHEN $5::boolean THEN NOW() ELSE completed_at END,
              psf_released_at = CASE WHEN $6::boolean THEN COALESCE(psf_released_at, NOW()) ELSE psf_released_at END,
              updated_at = NOW()
          WHERE id = $1
            AND status = '${DRAFT_STATUS}'
            AND updated_at = ($7::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
          RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        `,
        [
          id,
          target.name,
          productType,
          normalizedRequesterData,
          target.kind === 'completed',
          entersTrigger,
          dto.expectedUpdatedAt,
        ],
      );

      const submittedRow = result.rows[0];
      if (!submittedRow) {
        throw new ConflictException(
          'The request changed during submission. Reload and try again.',
        );
      }
      const canonicalValues =
        await this.searchIndexService.upsertSubmittedCanonicalValues(
          id,
          request.schema_snapshot_json,
          normalizedRequesterData,
          client,
        );

      await this.searchIndexService.upsertRequestSearchIndex(
        {
          requestId: submittedRow.id,
          requestNo: submittedRow.request_no,
          status: submittedRow.status,
          requester: submittedRow.requester,
          requesterUserId: submittedRow.requester_user_id,
          setupOwnerUserId: submittedRow.setup_owner_user_id ?? null,
          setupOwner: submittedRow.setup_owner,
          setupOwnerRole: submittedRow.setup_owner_role,
          productType: submittedRow.product_type,
          requestDate: submittedRow.created_at,
          updatedAt: submittedRow.updated_at,
        },
        canonicalValues,
        client,
      );

      await this.auditLogService.record(
        {
          requestId: submittedRow.id,
          actionType: REQUEST_AUDIT_ACTION.REQUEST_SUBMITTED,
          actor,
          metadata: { fromStatus: DRAFT_STATUS, toStatus: target.name },
        },
        client,
      );

      await this.notificationService?.enqueueRequest(client, {
        eventType: 'REQUEST_SUBMITTED',
        requestId: submittedRow.id,
        fromStatus: DRAFT_STATUS,
        targetStatus: target,
        actor,
      });

      return this.mapRequestRow(submittedRow, actor);
    });
  }

  private assertExpectedFormVersion(value: unknown): asserts value is number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new BadRequestException(
        'formVersion must be a positive safe integer.',
      );
    }
  }

  private assertCanEditPsfCreatedData(actor: AuthenticatedUserProfile): void {
    if (actor.role === 'requester') {
      throw new ForbiddenException(
        'Only Setup File Owners and admins can edit PSF Created Information',
      );
    }
  }

  private assertCanAccessRequest(
    request: Pick<PsfRequestRow, 'status' | 'requester_user_id'>,
    actor: AuthenticatedUserProfile,
  ): void {
    if (
      request.status === DRAFT_STATUS &&
      request.requester_user_id !== actor.id
    ) {
      throw new ForbiddenException(
        'Draft requests are private to their creator.',
      );
    }
  }

  private getServerRequesterIdentity(
    request: Pick<PsfRequestRow, 'requester' | 'requester_user_id'>,
    actor: AuthenticatedUserProfile,
  ): { displayName: string; userId: string | null } {
    return {
      displayName: request.requester ?? actor.displayName,
      userId: request.requester_user_id,
    };
  }

  private requestSchemaSnapshotMatchesVersion(
    request: Pick<
      PsfRequestRow,
      'form_key' | 'form_version' | 'schema_snapshot_json'
    >,
  ): boolean {
    const schemaSnapshot = request.schema_snapshot_json;

    return (
      isRecord(schemaSnapshot) &&
      schemaSnapshot.formKey === request.form_key &&
      schemaSnapshot.version === request.form_version
    );
  }

  private withServerRequesterIdentity(
    requesterData: RequesterData,
    requesterDisplayName: string,
  ): RequesterData {
    return {
      ...requesterData,
      requester_name: requesterDisplayName,
    };
  }

  private parseOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
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
      // Preserve the original submit error if rollback also fails.
    }
  }

  private async ensureRequestsStorage(
    queryRunner: QueryRunner = this.pool,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS psf_requests (
        id UUID PRIMARY KEY,
        request_no TEXT NOT NULL UNIQUE,
        form_key TEXT NOT NULL,
        form_version INT NOT NULL,
        status TEXT NOT NULL,
        requester TEXT,
        requester_user_id UUID,
        setup_owner_user_id UUID NULL,
        setup_owner TEXT,
        setup_owner_role TEXT,
        product_type TEXT,
        requester_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        psf_created_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        schema_snapshot_json JSONB NOT NULL,
        psf_created_schema_snapshot_json JSONB NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        submitted_at TIMESTAMP,
        psf_created_at TIMESTAMP,
        psf_released_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    await queryRunner.query(
      `ALTER TABLE psf_requests ADD COLUMN IF NOT EXISTS setup_owner_user_id UUID NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_psf_requests_setup_owner_user_id ON psf_requests (setup_owner_user_id)`,
    );

    await queryRunner.query(`
      ALTER TABLE psf_requests
      ADD COLUMN IF NOT EXISTS requester_user_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE psf_requests
      ADD COLUMN IF NOT EXISTS psf_created_schema_snapshot_json JSONB NULL
    `);

    await queryRunner.query(`
      ALTER TABLE psf_requests
      ADD COLUMN IF NOT EXISTS psf_released_at TIMESTAMP NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.app_users') IS NOT NULL THEN
          EXECUTE $backfill_requester_owners$
            UPDATE psf_requests AS request
            SET requester_user_id = owner.id
            FROM app_users AS owner
            WHERE request.requester_user_id IS NULL
              AND LOWER(request.requester) = LOWER(owner.display_name)
              AND NOT EXISTS (
                SELECT 1
                FROM app_users AS duplicate
                WHERE LOWER(duplicate.display_name) = LOWER(owner.display_name)
                  AND duplicate.id <> owner.id
              )
          $backfill_requester_owners$;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_requests_status_updated
      ON psf_requests (status, updated_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_requests_requester_user_id
      ON psf_requests (requester_user_id)
    `);
  }

  private async nextDraftRequestNo(
    queryRunner: QueryRunner = this.pool,
  ): Promise<string> {
    const result = await queryRunner.query<{ next: string }>(`
      SELECT 'DRAFT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
             LPAD((COUNT(*) + 1)::TEXT, 4, '0') AS next
      FROM psf_requests
      WHERE request_no LIKE 'DRAFT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%'
    `);

    return result.rows[0]?.next ?? `DRAFT-${Date.now()}`;
  }

  private normalizeRequesterDataToSchema(
    schema: FormSchemaJson,
    requesterData: RequesterData,
    initializeMissingValues = false,
  ): RequesterData {
    const nextData: RequesterData = {};

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (
          Object.prototype.hasOwnProperty.call(Object.prototype, field.fieldKey)
        ) {
          return;
        }

        if (Object.hasOwn(requesterData, field.fieldKey)) {
          nextData[field.fieldKey] = requesterData[field.fieldKey];
        } else if (initializeMissingValues) {
          nextData[field.fieldKey] = '';
        }
      });
    });

    return nextData;
  }

  private normalizePsfCreatedDataToSchema(
    psfCreatedData: RequesterData,
    schema: FormSchemaJson,
  ): RequesterData {
    const fields = new Map(
      schema.sections.flatMap((section) =>
        section.fields.map((field) => [field.fieldKey, field] as const),
      ),
    );
    const nextData: RequesterData = {};

    for (const [fieldKey, rawValue] of Object.entries(psfCreatedData)) {
      const field = fields.get(fieldKey);
      if (!field) {
        throw new BadRequestException(
          `Unknown PSF Created Information field: ${fieldKey}.`,
        );
      }
      if (rawValue === null || rawValue === undefined) continue;
      if (typeof rawValue !== 'string') {
        throw new BadRequestException(`${field.label} must be a string.`);
      }

      const value = rawValue.trim();
      if (!value) continue;
      if (field.type === 'date' && !this.isValidPsfCreatedCalendarDate(value)) {
        throw new BadRequestException(
          `${field.label} must be a valid ISO calendar date.`,
        );
      }
      if (
        (field.type === 'select' || field.type === 'radio') &&
        !field.options?.includes(value)
      ) {
        throw new BadRequestException(
          `${field.label} must be one of the configured options.`,
        );
      }
      Object.defineProperty(nextData, fieldKey, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    return nextData;
  }

  private assertPsfCreatedDataPayload(
    psfCreatedData: unknown,
  ): asserts psfCreatedData is RequesterData {
    if (
      typeof psfCreatedData !== 'object' ||
      psfCreatedData === null ||
      Array.isArray(psfCreatedData)
    ) {
      throw new BadRequestException(
        'PSF Created Information must be a JSON object.',
      );
    }
  }

  private assertExpectedUpdatedAt(
    updatedAt: unknown,
  ): asserts updatedAt is string {
    if (typeof updatedAt !== 'string' || updatedAt.length === 0) {
      throw new BadRequestException(
        'A request updatedAt revision token is required.',
      );
    }
  }

  private assertRequiredRequesterFieldsPresent(
    schema: FormSchemaJson,
    requesterData: RequesterData,
  ): void {
    const missingLabels = schema.sections.flatMap((section) =>
      section.fields
        .filter(
          (field) =>
            field.required &&
            !this.hasSubmittedValue(requesterData[field.fieldKey]),
        )
        .map((field) => field.label),
    );

    if (missingLabels.length > 0) {
      throw new BadRequestException(
        `Draft request is missing required fields for the active schema: ${missingLabels.join(', ')}`,
      );
    }
  }

  private assertRequiredPsfCreatedFieldsPresent(
    schema: FormSchemaJson,
    psfCreatedData: RequesterData,
  ): void {
    const missingLabels = schema.sections.flatMap((section) =>
      section.fields
        .filter((field) => {
          const value = Object.hasOwn(psfCreatedData, field.fieldKey)
            ? psfCreatedData[field.fieldKey]
            : undefined;
          return (
            field.required &&
            (typeof value !== 'string' ||
              value.trim().length === 0 ||
              ((field.type === 'select' || field.type === 'radio') &&
                !field.options?.includes(value.trim())) ||
              (field.type === 'date' &&
                !this.isValidPsfCreatedCalendarDate(value.trim())))
          );
        })
        .map((field) => field.label),
    );

    if (missingLabels.length > 0) {
      throw new BadRequestException(
        `PSF Created Information is missing required fields: ${missingLabels.join(', ')}.`,
      );
    }
  }

  private isValidPsfCreatedCalendarDate(value: string): boolean {
    const normalizedValue = value.trim();
    const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);

    return (
      /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) &&
      !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === normalizedValue
    );
  }

  private hasSubmittedValue(value: unknown): boolean {
    return typeof value === 'string'
      ? value.trim().length > 0
      : value !== null && value !== undefined;
  }

  private normalizeString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private canActorEditPsfCreatedData(
    _status: string,
    actor?: AuthenticatedUserProfile,
  ): boolean {
    if (!actor) {
      return false;
    }

    return actor.role === 'admin' || actor.role === 'setup_owner';
  }

  private mapRequestRow(
    row: PsfRequestRow,
    actor?: AuthenticatedUserProfile,
  ): PsfRequestResponse {
    const psfCreatedDataVisible = canActorViewPsfCreatedData(
      row.status,
      actor,
      row.psf_released_at,
    );

    return {
      id: row.id,
      requestNo: row.request_no,
      formKey: row.form_key,
      formVersion: row.form_version,
      status: row.status,
      requester: row.requester,
      setupOwnerUserId: row.setup_owner_user_id ?? null,
      setupOwner: row.setup_owner,
      setupOwnerRole: row.setup_owner_role,
      productType: row.product_type,
      requesterData: row.requester_data_json ?? {},
      psfCreatedData: psfCreatedDataVisible
        ? (row.psf_created_data_json ?? {})
        : {},
      psfCreatedDataVisible,
      canEditPsfCreatedData: this.canActorEditPsfCreatedData(row.status, actor),
      canEditRequesterData:
        actor !== undefined &&
        (row.status !== DRAFT_STATUS || row.requester_user_id === actor.id),
      canSubmitDraft:
        actor !== undefined &&
        row.status === DRAFT_STATUS &&
        row.requester_user_id === actor.id,
      requesterUserId: row.requester_user_id,
      psfReleasedAt: this.serializeNullableTimestamp(row.psf_released_at),
      psfCreatedInformationSchema: resolvePsfCreatedInformationSchema(
        row.psf_created_schema_snapshot_json,
      ),
      schemaSnapshot: row.schema_snapshot_json,
      createdAt: this.serializeTimestamp(row.created_at),
      updatedAt:
        row.updated_at_version ?? this.serializeTimestamp(row.updated_at),
      submittedAt: this.serializeNullableTimestamp(row.submitted_at),
      psfCreatedAt: this.serializeNullableTimestamp(row.psf_created_at),
      completedAt: this.serializeNullableTimestamp(row.completed_at),
    };
  }

  private getFieldChanges(
    schema: FormSchemaJson,
    before: RequesterData,
    after: RequesterData,
  ): Array<{
    fieldKey: string;
    fieldLabel: string;
    before: unknown;
    after: unknown;
  }> {
    return schema.sections.flatMap((section) =>
      section.fields.flatMap((field) => {
        const previous = Object.hasOwn(before, field.fieldKey)
          ? before[field.fieldKey]
          : null;
        const next = Object.hasOwn(after, field.fieldKey)
          ? after[field.fieldKey]
          : null;
        return JSON.stringify(previous) === JSON.stringify(next)
          ? []
          : [
              {
                fieldKey: field.fieldKey,
                fieldLabel: field.label,
                before: previous,
                after: next,
              },
            ];
      }),
    );
  }

  private serializeNullableTimestamp(
    value: Date | string | null,
  ): string | null {
    if (value === null) {
      return null;
    }

    return this.serializeTimestamp(value);
  }

  private serializeTimestamp(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : value;
  }
}
