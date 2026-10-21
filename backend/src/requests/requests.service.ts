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
import { escapeHtml } from '../notifications/notification.template';
import {
  RequestSearchFilters,
  RequestSearchResult,
  RequestScopeFilters,
  SearchIndexService,
} from './search-index.service';
import {
  assertValidRequiredFormData,
  isNumericText,
  validateAndNormalizeFormData,
} from './form-data-validation';
import {
  RequestAttachmentsService,
  type RegisterUndo,
} from './request-attachments.service';

const PSF_REQUEST_FORM_KEY = 'psf-request';
const DRAFT_STATUS = 'Draft';
// Continues the Imported Requests' integer IDs (PSF-000100 is ID 100).
const NUMERIC_ID_SEQUENCE = 'psf_request_numeric_id_seq';

const REQUEST_UPDATED_AT_VERSION_SQL = `TO_CHAR(
  updated_at AT TIME ZONE current_setting('TIMEZONE') AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
)`;

type QueryRunner = Pick<Pool | PoolClient, 'query'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Modified By is recorded by the server on every save, whether or not the
// request's form has a Modified By field, so it is never form input.
function withoutModifiedBy(requesterData: unknown): unknown {
  if (!isRecord(requesterData)) return requesterData;
  const formData = { ...requesterData };
  delete formData.modified_by;
  return formData;
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
}

export interface UpdateDraftRequesterDataDto {
  formVersion: number;
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
  relation?: 'all' | 'created';
  workState?: 'all' | 'open' | 'overdue' | 'completed';
};

export interface PsfRequestResponse {
  id: string;
  // The sequential integer ID shared with the request's NAS folder name.
  numericId: number;
  requestNo: string;
  formKey: string;
  formVersion: number;
  status: string;
  requester: string | null;
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

export interface RequestSnapshotResponse {
  entry: RequestAuditHistoryEntry;
  requestNo: string;
  // The request's Work Status now; `status` is the one of that time.
  currentStatus: string;
  status: string;
  formVersion: number;
  requesterData: RequesterData;
  psfCreatedData: RequesterData;
  psfCreatedDataVisible: boolean;
  schemaSnapshot: FormSchemaJson;
  psfCreatedInformationSchema: FormSchemaJson;
}

interface PsfRequestRow {
  id: string;
  numeric_id: number;
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
    @Optional() private readonly requestAttachments?: RequestAttachmentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.withTransaction(async (client) => {
      await this.ensureRequestsStorage(client);
      await this.searchIndexService.ensureRequestSearchIndexStorage(client);
      await this.ensureDraftManagementStorage(client);
      await this.indexListedPsfFileNames(client);
      await this.recordModifiedByFromAuditHistory(client);
      await this.requestAttachments?.ensureStorage(client);
    });
  }

  async createDraft(
    dto: CreateDraftRequestDto,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    this.assertNoAssignment(dto);
    const activeSchema =
      await this.formSchemaService.getActiveSchema(PSF_REQUEST_FORM_KEY);
    const requester = actor.displayName;
    const requesterData = this.withServerRequesterIdentity(
      validateAndNormalizeFormData(
        activeSchema.schema,
        withoutModifiedBy(dto.requesterData),
        { allowMissingRequired: true },
      ),
      requester,
      this.shouldTrackStartDate(activeSchema.schema) ? new Date().toISOString().slice(0, 10) : undefined,
      actor.displayName,
    );

    return this.withTransaction(async (client) => {
      const psfCreatedSchema =
        await this.formSchemaService.getActiveSchemaForUpdate(
          PSF_CREATED_INFORMATION_FORM_KEY,
          client,
        );
      const requestNo = await this.nextDraftRequestNo(client);
      const productType = this.normalizeString(requesterData.product_type);
      const result = await client.query<PsfRequestRow>(
        `
          INSERT INTO psf_requests (
            id,
            numeric_id,
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
            created_at,
            updated_at
          )
          VALUES ($1, nextval('${NUMERIC_ID_SEQUENCE}'), $2, $3, $4, $5, $6, $7::uuid, $8, $9::jsonb, '{}'::jsonb, $10::jsonb, $11::jsonb, NOW(), NOW())
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
        ],
      );

      const createdRow = result.rows[0];
      await this.auditLogService.record(
        {
          requestId: createdRow.id,
          actionType: REQUEST_AUDIT_ACTION.DRAFT_CREATED,
          actor,
          metadata: this.fieldChangesMetadata(
            activeSchema.schema,
            {},
            requesterData,
          ),
        },
        client,
      );

      return this.mapRequestRow(createdRow, actor);
    });
  }

  private assertNoAssignment(dto: unknown): void {
    if (
      dto &&
      typeof dto === 'object' &&
      ['setupOwnerUserId', 'setupOwner', 'setupOwnerRole'].some((key) =>
        Object.hasOwn(dto, key),
      )
    ) {
      throw new BadRequestException(
        'Request assignment is no longer supported.',
      );
    }
  }

  private assertAdmin(actor: AuthenticatedUserProfile): void {
    if (actor.role !== 'admin')
      throw new ForbiddenException('Only admins can manage Drafts.');
  }

  async getAdminDraft(
    id: string,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    this.assertAdmin(actor);
    const result = await this.pool.query<PsfRequestRow>(
      `SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version FROM psf_requests WHERE id=$1 AND status='Draft'`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Draft not found.');
    const response = this.mapRequestRow(row, actor);
    if (row.requester_user_id !== actor.id) {
      response.canEditRequesterData = false;
      response.canEditPsfCreatedData = false;
      response.canSubmitDraft = false;
    }
    return response;
  }

  async listAdminDrafts(
    query: Record<string, unknown>,
    actor: AuthenticatedUserProfile,
  ) {
    this.assertAdmin(actor);
    if (
      Object.keys(query).some(
        (key) =>
          !['keyword', 'creator', 'productType', 'limit', 'offset'].includes(
            key,
          ),
      )
    )
      throw new BadRequestException('Unsupported Draft query filter.');
    const { limit, offset } = this.managementPage(query);
    const params: unknown[] = [];
    const where = ["status='Draft'"];
    for (const [key, column] of [
      ['creator', 'requester'],
      ['productType', 'product_type'],
    ] as const) {
      if (query[key] !== undefined && typeof query[key] !== 'string')
        throw new BadRequestException(`${key} must be text.`);
      if (typeof query[key] === 'string' && query[key].trim()) {
        params.push(
          key === 'creator' ? `%${query[key].trim()}%` : query[key].trim(),
        );
        where.push(`${column} ILIKE $${params.length}`);
      }
    }
    if (query.keyword !== undefined && typeof query.keyword !== 'string')
      throw new BadRequestException('keyword must be text.');
    if (typeof query.keyword === 'string' && query.keyword.trim()) {
      params.push(`%${query.keyword.trim()}%`);
      where.push(
        `(request_no ILIKE $${params.length} OR requester ILIKE $${params.length} OR requester_data_json::text ILIKE $${params.length})`,
      );
    }
    const result = await this.pool.query<PsfRequestRow & { total: number }>(
      `WITH filtered AS (SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version FROM psf_requests WHERE ${where.join(' AND ')}), page AS (SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT $${params.length + 1} OFFSET $${params.length + 2}) SELECT page.*, counts.total FROM (SELECT COUNT(*)::int AS total FROM filtered) counts LEFT JOIN page ON TRUE`,
      [...params, limit, offset],
    );
    return {
      items: result.rows
        .filter((row) => row.id)
        .map((row) => ({
          requestId: row.id,
          requestNo: row.request_no,
          title:
            this.searchIndexService.extractCanonicalValues(
              row.schema_snapshot_json,
              row.requester_data_json,
            ).title ?? null,
          requester: row.requester,
          requesterUserId: row.requester_user_id,
          productType: row.product_type,
          createdAt: this.serializeTimestamp(row.created_at),
          updatedAt:
            row.updated_at_version ?? this.serializeTimestamp(row.updated_at),
        })),
      total: result.rows[0]?.total ?? 0,
      limit,
      offset,
    };
  }

  private managementPage(query: Record<string, unknown>) {
    for (const value of [query.limit, query.offset]) {
      if (
        value !== undefined &&
        !(
          typeof value === 'number' ||
          (typeof value === 'string' && /^\d+$/.test(value))
        )
      )
        throw new BadRequestException('Invalid pagination.');
    }
    const limit = query.limit === undefined ? 25 : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0
    )
      throw new BadRequestException('Invalid pagination.');
    return { limit, offset };
  }

  async listDraftDeletions(
    query: Record<string, unknown>,
    actor: AuthenticatedUserProfile,
  ) {
    this.assertAdmin(actor);
    const { limit, offset } = this.managementPage(query);
    const result = await this.pool.query<{
      draft_no: string;
      actor_display_name: string;
      actor_role: string;
      deleted_at: Date | string;
      total: number;
    }>(
      `WITH page AS (SELECT * FROM draft_deletion_logs ORDER BY deleted_at DESC,id DESC LIMIT $1 OFFSET $2) SELECT page.*, counts.total FROM (SELECT COUNT(*)::int AS total FROM draft_deletion_logs) counts LEFT JOIN page ON TRUE`,
      [limit, offset],
    );
    return {
      items: result.rows
        .filter((row) => row.draft_no)
        .map((row) => ({
          draftNo: row.draft_no,
          actorDisplayName: row.actor_display_name,
          actorRole: row.actor_role,
          deletedAt: this.serializeTimestamp(row.deleted_at),
        })),
      total: result.rows[0]?.total ?? 0,
      limit,
      offset,
    };
  }

  async deleteDraft(
    id: string,
    expectedUpdatedAt: unknown,
    actor: AuthenticatedUserProfile,
  ): Promise<{ deleted: true }> {
    this.assertExpectedUpdatedAt(expectedUpdatedAt);
    const deleted = await this.withTransaction(async (client) => {
      const result = await client.query<PsfRequestRow>(
        `SELECT *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version FROM psf_requests WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException('Draft not found.');
      if (row.status !== DRAFT_STATUS)
        throw new ConflictException('Submitted requests cannot be deleted.');
      if (row.requester_user_id !== actor.id && actor.role !== 'admin')
        throw new ForbiddenException(
          'Only the Draft creator or Admin can delete it.',
        );
      if (row.updated_at_version !== expectedUpdatedAt)
        throw new ConflictException(
          'The Draft changed. Reload before deleting.',
        );
      await this.requestAttachments?.assertFolderRemovable();
      await client.query(
        'DELETE FROM canonical_submission_values WHERE request_id=$1',
        [id],
      );
      await client.query(
        'DELETE FROM psf_request_search_index WHERE request_id=$1',
        [id],
      );
      await client.query(
        'DELETE FROM psf_request_audit_logs WHERE request_id=$1',
        [id],
      );
      if (
        (
          await client.query<{ exists: boolean }>(
            "SELECT to_regclass('public.email_outbox') IS NOT NULL AS exists",
          )
        ).rows[0]?.exists
      )
        await client.query(
          `DELETE FROM email_outbox WHERE request_id=$1 OR
          (event_type='ADMIN_ALERT' AND body_html LIKE '%<td>DRAFT_REMINDER</td>%'
          AND POSITION($2 IN body_html)>0)`,
          [id, `<td>${escapeHtml(row.request_no)}</td>`],
        );
      if (
        (
          await client.query<{ exists: boolean }>(
            "SELECT to_regclass('public.psf_export_jobs') IS NOT NULL AS exists",
          )
        ).rows[0]?.exists
      )
        await client.query(
          "UPDATE psf_export_jobs SET status='failed', content=NULL, filename=NULL, claim_token=NULL, failed_at=NOW(), failure_message='Export invalidated after permanent Draft deletion.' WHERE owner_user_id=$1",
          [row.requester_user_id],
        );
      await client.query(
        'INSERT INTO draft_deletion_logs(id,draft_no,actor_id,actor_display_name,actor_role,deleted_at) VALUES($1,$2,$3,$4,$5,NOW())',
        [randomUUID(), row.request_no, actor.id, actor.displayName, actor.role],
      );
      // Its Attachment rows go with it (ON DELETE CASCADE).
      await client.query('DELETE FROM psf_requests WHERE id=$1', [id]);
      return row;
    });
    await this.requestAttachments?.removeRequestFolder(
      deleted.requester_data_json?.title,
      deleted.numeric_id,
    );
    return { deleted: true };
  }

  private async ensureDraftManagementStorage(
    client: QueryRunner,
  ): Promise<void> {
    await client.query(
      `CREATE TABLE IF NOT EXISTS draft_deletion_logs(id UUID PRIMARY KEY,draft_no TEXT NOT NULL,actor_id UUID NOT NULL,actor_display_name TEXT NOT NULL,actor_role TEXT NOT NULL,deleted_at TIMESTAMPTZ NOT NULL)`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS request_data_migrations(key TEXT PRIMARY KEY)`,
    );
    await client.query('LOCK TABLE request_data_migrations IN EXCLUSIVE MODE');
    const migrated = await client.query(
      "SELECT key FROM request_data_migrations WHERE key='remove-request-assignment-v1'",
    );
    if (migrated.rows.length) return;
    await client.query(
      'UPDATE psf_requests SET setup_owner_user_id=NULL,setup_owner=NULL,setup_owner_role=NULL',
    );
    await client.query(
      'UPDATE psf_request_search_index SET setup_owner_user_id=NULL,setup_owner=NULL,setup_owner_role=NULL',
    );
    if (
      (
        await client.query<{ exists: boolean }>(
          "SELECT to_regclass('public.psf_request_audit_logs') IS NOT NULL AS exists",
        )
      ).rows[0]?.exists
    ) {
      await client.query(
        "DELETE FROM psf_request_audit_logs WHERE action_type='REQUEST_ASSIGNEE_CHANGED'",
      );
      const assignmentKeys = new Set([
        'assignment',
        'beforeAssignment',
        'afterAssignment',
        'setupOwnerUserId',
        'setupOwner',
        'setupOwnerRole',
        'setup_owner_user_id',
        'setup_owner',
        'setup_owner_role',
      ]);
      const stripAssignment = (value: unknown): unknown => {
        if (Array.isArray(value))
          return value
            .filter(
              (item) =>
                !(
                  item &&
                  typeof item === 'object' &&
                  assignmentKeys.has(
                    String(
                      (item as Record<string, unknown>).fieldKey ??
                        (item as Record<string, unknown>).canonicalKey,
                    ),
                  )
                ),
            )
            .map(stripAssignment);
        if (value && typeof value === 'object')
          return Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => !assignmentKeys.has(key))
              .map(([key, item]) => [key, stripAssignment(item)]),
          );
        return value;
      };
      const events = await client.query<{
        id: string;
        metadata_json: Record<string, unknown>;
      }>('SELECT id,metadata_json FROM psf_request_audit_logs');
      for (const event of events.rows) {
        const cleaned = stripAssignment(event.metadata_json);
        if (JSON.stringify(cleaned) !== JSON.stringify(event.metadata_json))
          await client.query(
            'UPDATE psf_request_audit_logs SET metadata_json=$2::jsonb WHERE id=$1',
            [event.id, JSON.stringify(cleaned)],
          );
      }
    }
    if (
      (
        await client.query<{ exists: boolean }>(
          "SELECT to_regclass('public.psf_export_jobs') IS NOT NULL AS exists",
        )
      ).rows[0]?.exists
    )
      await client.query(
        "UPDATE psf_export_jobs SET status='failed',content=NULL,filename=NULL,claim_token=NULL,failed_at=NOW(),failure_message='Export invalidated after request assignment removal.'",
      );
    await client.query(
      "INSERT INTO request_data_migrations(key) VALUES('remove-request-assignment-v1') ON CONFLICT DO NOTHING",
    );
  }

  // Requests saved before the request list showed PSF file names have no Job
  // File Name in the search index, and a PSF Setup File Name only where its
  // field was searchable. Runs once, after ensureDraftManagementStorage.
  private async indexListedPsfFileNames(client: QueryRunner): Promise<void> {
    const migrated = await client.query(
      "SELECT key FROM request_data_migrations WHERE key='index-psf-file-names-v1'",
    );
    if (migrated.rows.length) return;
    const requests = await client.query<
      Pick<
        PsfRequestRow,
        'id' | 'psf_created_schema_snapshot_json' | 'psf_created_data_json'
      >
    >(
      `SELECT id, psf_created_schema_snapshot_json, psf_created_data_json FROM psf_requests WHERE status <> '${DRAFT_STATUS}'`,
    );
    for (const request of requests.rows) {
      const fileNames = this.withPsfFileNameCanonicals(
        {},
        request.psf_created_schema_snapshot_json,
        request.psf_created_data_json,
      );
      await client.query(
        'UPDATE psf_request_search_index SET psf_setup_file_name = COALESCE($2, psf_setup_file_name), job_file_name = COALESCE($3, job_file_name) WHERE request_id = $1',
        [
          request.id,
          fileNames.psf_setup_file_name ?? null,
          fileNames.job_file_name ?? null,
        ],
      );
    }
    await client.query(
      "INSERT INTO request_data_migrations(key) VALUES('index-psf-file-names-v1')",
    );
  }

  // Requests saved while Modified By was recorded only on forms with a
  // Modified By field get the actor of their latest individual save. A bulk
  // Status replacement does not change request content (ADR 0016), so it
  // records no Modified By. Runs once, after ensureDraftManagementStorage.
  private async recordModifiedByFromAuditHistory(
    client: QueryRunner,
  ): Promise<void> {
    const migrated = await client.query(
      "SELECT key FROM request_data_migrations WHERE key='modified-by-from-audit-history-v1'",
    );
    if (migrated.rows.length) return;
    const audit = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.psf_request_audit_logs') IS NOT NULL AS exists",
    );
    if (audit.rows[0]?.exists)
      await client.query(
        `
          UPDATE psf_requests AS request
          SET requester_data_json = request.requester_data_json ||
            jsonb_build_object('modified_by', latest.actor_display_name)
          FROM (
            SELECT DISTINCT ON (request_id) request_id, actor_display_name
            FROM psf_request_audit_logs
            WHERE request_id IS NOT NULL
              AND action_type = ANY($1::text[])
              AND COALESCE(metadata_json->>'bulkReplacement', '') <> 'true'
            ORDER BY request_id, created_at DESC, id DESC
          ) AS latest
          WHERE request.id = latest.request_id
            AND COALESCE(btrim(request.requester_data_json->>'modified_by'), '') = ''
        `,
        [
          [
            REQUEST_AUDIT_ACTION.DRAFT_CREATED,
            REQUEST_AUDIT_ACTION.DRAFT_REQUESTER_DATA_UPDATED,
            REQUEST_AUDIT_ACTION.REQUEST_SUBMITTED,
            REQUEST_AUDIT_ACTION.REQUEST_STATUS_CHANGED,
            REQUEST_AUDIT_ACTION.REQUESTER_INFORMATION_UPDATED,
            REQUEST_AUDIT_ACTION.PSF_CREATED_INFORMATION_UPDATED,
          ],
        ],
      );
    await client.query(
      "INSERT INTO request_data_migrations(key) VALUES('modified-by-from-audit-history-v1')",
    );
  }

  async queryRequests(
    query: RequestQueryDto,
    actor: AuthenticatedUserProfile,
  ): Promise<RequestSearchResult> {
    this.assertNoAssignment(query);
    if (
      query.relation !== undefined &&
      !['all', 'created'].includes(query.relation)
    )
      throw new BadRequestException('Unsupported relationship filter.');
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

  async getRequestSnapshot(
    id: string,
    entryId: string,
    actor: AuthenticatedUserProfile,
  ): Promise<RequestSnapshotResponse> {
    const request = await this.getRequest(id, actor);
    const found = await this.auditLogService.findRequestSnapshot(id, entryId);
    if (
      !found ||
      (!request.psfCreatedDataVisible &&
        found.entry.actionType ===
          REQUEST_AUDIT_ACTION.PSF_CREATED_INFORMATION_UPDATED)
    ) {
      throw new NotFoundException('Request Snapshot was not found.');
    }

    const { entry, requestSnapshot } = found;
    return {
      entry,
      requestNo: request.requestNo,
      currentStatus: request.status,
      status: requestSnapshot.status,
      formVersion: requestSnapshot.formVersion,
      requesterData: requestSnapshot.requesterData,
      psfCreatedData: request.psfCreatedDataVisible
        ? requestSnapshot.psfCreatedData
        : {},
      psfCreatedDataVisible: request.psfCreatedDataVisible,
      schemaSnapshot:
        requestSnapshot.formVersion === request.formVersion
          ? request.schemaSnapshot
          : await this.schemaForFormVersion(
              request,
              requestSnapshot.formVersion,
            ),
      psfCreatedInformationSchema: request.psfCreatedInformationSchema,
    };
  }

  // Only a Draft upgraded since then reaches this. Published Form Versions
  // are immutable, so the Form Schema of that time is still on record.
  private async schemaForFormVersion(
    request: PsfRequestResponse,
    version: number,
  ): Promise<FormSchemaJson> {
    const { versions } = await this.formSchemaService.listVersions(
      request.formKey,
    );
    const schema = versions.find(
      (candidate) => candidate.version === version,
    )?.schema;
    if (!schema) {
      throw new NotFoundException(
        `Form Version ${version} of this Request Snapshot is no longer on record.`,
      );
    }
    return schema;
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
    this.assertNoAssignment(dto);
    this.assertExpectedFormVersion(dto.formVersion);
    this.assertExpectedUpdatedAt(dto.expectedUpdatedAt);

    return this.withTransaction(async (client, onRollback) => {
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

      const requesterIdentity = this.getServerRequesterIdentity(request, actor);
      const startDate = this.resolveServerStartDate(request.schema_snapshot_json, request.requester_data_json, request.created_at);
      const baseRequesterData = this.withServerRequesterIdentity(
        validateAndNormalizeFormData(
          request.schema_snapshot_json,
          withoutModifiedBy(dto.requesterData),
          {
            allowMissingRequired: request.status === DRAFT_STATUS,
            existingData: request.requester_data_json ?? {},
          },
        ),
        requesterIdentity.displayName,
        startDate,
      );
      const userFieldChanges = this.getFieldChanges(
        request.schema_snapshot_json,
        request.requester_data_json ?? {},
        baseRequesterData,
      ).filter((change) => change.fieldKey !== 'modified_by' && change.fieldKey !== 'start_date');
      // A save that changes nothing writes nothing: no Audit History entry
      // and no new revision for other editors to conflict with.
      if (userFieldChanges.length === 0)
        return this.mapRequestRow(request, actor);

      const requesterData = this.withServerRequesterIdentity(
        baseRequesterData,
        requesterIdentity.displayName,
        startDate,
        actor.displayName,
      );
      const fieldChanges = this.getFieldChanges(
        request.schema_snapshot_json,
        request.requester_data_json ?? {},
        requesterData,
      );

      const productType = this.normalizeString(requesterData.product_type);
      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET product_type = $2,
              requester_data_json = $3::jsonb,
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
            productType: updatedRow.product_type,
            requestDate: updatedRow.created_at,
            updatedAt: updatedRow.updated_at,
          },
          this.withPsfFileNameCanonicals(
            canonicalValues,
            updatedRow.psf_created_schema_snapshot_json,
            updatedRow.psf_created_data_json,
          ),
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
          metadata: { fieldChanges },
        },
        client,
      );
      await this.renameAttachmentFolder(
        client,
        request,
        updatedRow,
        onRollback,
      );

      return this.mapRequestRow(updatedRow, actor);
    });
  }

  async upgradeDraftSchema(
    id: string,
    dto: UpgradeDraftSchemaDto,
    actor: AuthenticatedUserProfile,
  ): Promise<PsfRequestResponse> {
    this.assertExpectedFormVersion(dto.formVersion);

    return this.withTransaction(async (client, onRollback) => {
      const current = await client.query<
        Pick<
          PsfRequestRow,
          | 'id'
          | 'numeric_id'
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
            numeric_id,
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
        this.resolveServerStartDate(activeSchema.schema, request.requester_data_json),
        actor.displayName,
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
            // Diffed over the earlier Form Schema, so removed fields are listed.
            ...this.fieldChangesMetadata(
              request.schema_snapshot_json,
              request.requester_data_json ?? {},
              requesterData,
            ),
          },
        },
        client,
      );
      await this.renameAttachmentFolder(
        client,
        request,
        upgradedRow,
        onRollback,
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
          existingData: request.psf_created_data_json ?? {},
        },
      );
      const fieldChanges = this.getFieldChanges(
        schema,
        request.psf_created_data_json ?? {},
        psfCreatedData,
      );
      if (fieldChanges.length === 0)
        return this.mapRequestRow(request, dto.actor);

      const hasPsfData = Object.values(psfCreatedData).some(
        (value) => typeof value === 'string' && value.trim().length > 0,
      );
      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET psf_created_data_json = $2::jsonb,
              psf_created_at = CASE WHEN $3::boolean THEN COALESCE(psf_created_at, NOW()) ELSE psf_created_at END,
              requester_data_json = $5::jsonb,
              updated_at = NOW()
          WHERE id = $1
            AND updated_at = ($4::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
          RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        `,
        [
          id,
          psfCreatedData,
          hasPsfData,
          dto.expectedUpdatedAt,
          {
            ...(request.requester_data_json ?? {}),
            modified_by: dto.actor.displayName,
          },
        ],
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
            productType: updatedRow.product_type,
            requestDate: updatedRow.created_at,
            updatedAt: updatedRow.updated_at,
          },
          this.withPsfFileNameCanonicals(
            this.searchIndexService.extractCanonicalValues(
              updatedRow.schema_snapshot_json,
              updatedRow.requester_data_json ?? {},
            ),
            updatedRow.psf_created_schema_snapshot_json,
            updatedRow.psf_created_data_json,
          ),
          client,
        );
      }
      await this.auditLogService.record(
        {
          requestId: updatedRow.id,
          actionType: REQUEST_AUDIT_ACTION.PSF_CREATED_INFORMATION_UPDATED,
          actor: dto.actor,
          metadata: { fieldChanges },
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
              requester_data_json = $7::jsonb,
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
          {
            ...(currentRequest.requester_data_json ?? {}),
            modified_by: dto.actor.displayName,
          },
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
          productType: updatedRow.product_type,
          requestDate: updatedRow.created_at,
          updatedAt: updatedRow.updated_at,
        },
        this.withPsfFileNameCanonicals(
          this.searchIndexService.extractCanonicalValues(
            updatedRow.schema_snapshot_json,
            updatedRow.requester_data_json,
          ),
          updatedRow.psf_created_schema_snapshot_json,
          updatedRow.psf_created_data_json,
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
    this.assertNoAssignment(dto);
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
          withoutModifiedBy(request.requester_data_json ?? {}),
          {
            allowMissingRequired: false,
            existingData: request.requester_data_json ?? {},
          },
        ),
        requesterIdentity.displayName,
        this.resolveServerStartDate(activeSchema.schema, request.requester_data_json),
        actor.displayName,
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
              request_no = $8,
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
          this.submittedRequestNo(request.numeric_id),
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
          productType: submittedRow.product_type,
          requestDate: submittedRow.created_at,
          updatedAt: submittedRow.updated_at,
        },
        this.withPsfFileNameCanonicals(
          canonicalValues,
          submittedRow.psf_created_schema_snapshot_json,
          submittedRow.psf_created_data_json,
        ),
        client,
      );

      await this.auditLogService.record(
        {
          requestId: submittedRow.id,
          actionType: REQUEST_AUDIT_ACTION.REQUEST_SUBMITTED,
          actor,
          metadata: {
            fromStatus: DRAFT_STATUS,
            toStatus: target.name,
            ...this.fieldChangesMetadata(
              request.schema_snapshot_json,
              request.requester_data_json ?? {},
              normalizedRequesterData,
            ),
          },
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

  // PSF- and the six-digit zero-padded ID, the Imported Requests' numbering.
  private submittedRequestNo(numericId: number): string {
    return `PSF-${String(numericId).padStart(6, '0')}`;
  }

  private async renameAttachmentFolder(
    client: QueryRunner,
    before: Pick<PsfRequestRow, 'requester_data_json'>,
    after: Pick<PsfRequestRow, 'id' | 'numeric_id' | 'requester_data_json'>,
    onRollback: RegisterUndo,
  ): Promise<void> {
    await this.requestAttachments?.renameRequestFolder(
      client,
      { id: after.id, numericId: after.numeric_id },
      before.requester_data_json?.title,
      after.requester_data_json?.title,
      onRollback,
    );
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

  // The request list shows these PSF Created Information values, so every
  // search index write carries them, whether or not the field is searchable.
  private withPsfFileNameCanonicals(
    canonicalValues: Record<
      string,
      string | number | boolean | string[] | null
    >,
    psfCreatedSchemaSnapshot: FormSchemaJson | null | undefined,
    psfCreatedData: RequesterData | null | undefined,
  ): Record<string, string | number | boolean | string[] | null> {
    if (!psfCreatedData || typeof psfCreatedData !== 'object') {
      return canonicalValues;
    }
    const fields = resolvePsfCreatedInformationSchema(
      psfCreatedSchemaSnapshot,
    ).sections.flatMap((section) => section.fields);
    const withFileNames = { ...canonicalValues };
    for (const key of ['psf_setup_file_name', 'job_file_name']) {
      const field = fields.find(
        (candidate) =>
          candidate.canonicalKey === key || candidate.fieldKey === key,
      );
      const value = field ? psfCreatedData[field.fieldKey] : undefined;
      if (typeof value === 'string' && value.trim().length > 0)
        withFileNames[key] = value.trim();
    }
    return withFileNames;
  }

  private shouldTrackStartDate(
    schema?: FormSchemaJson | null,
    existingRequesterData?: RequesterData | null,
  ): boolean {
    if (
      existingRequesterData &&
      Object.hasOwn(existingRequesterData, 'start_date')
    ) {
      return true;
    }
    return Boolean(
      schema?.sections?.some((section) =>
        section.fields?.some(
          (field) =>
            field.fieldKey === 'start_date' ||
            field.canonicalKey === 'start_date',
        ),
      ),
    );
  }

  private resolveServerStartDate(
    schema?: FormSchemaJson | null,
    existingRequesterData?: RequesterData | null,
    createdAt?: Date | string,
  ): string | undefined {
    if (!this.shouldTrackStartDate(schema, existingRequesterData)) {
      return undefined;
    }
    if (
      typeof existingRequesterData?.start_date === 'string' &&
      existingRequesterData.start_date.trim().length > 0
    ) {
      return existingRequesterData.start_date.trim();
    }
    return createdAt !== undefined
      ? this.serializeTimestamp(createdAt).slice(0, 10)
      : undefined;
  }

  private withServerRequesterIdentity(
    requesterData: RequesterData,
    requesterDisplayName: string,
    startDate?: string,
    modifiedByDisplayName?: string,
  ): RequesterData {
    return {
      ...requesterData,
      requester_name: requesterDisplayName,
      ...(startDate !== undefined ? { start_date: startDate } : {}),
      ...(modifiedByDisplayName !== undefined
        ? { modified_by: modifiedByDisplayName }
        : {}),
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

  // Work outside the database, such as a NAS folder rename, registers its
  // undo through onRollback.
  private async withTransaction<T>(
    operation: (client: PoolClient, onRollback: RegisterUndo) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    const undos: Array<() => Promise<void>> = [];

    try {
      await client.query('BEGIN');
      const result = await operation(client, (undo) => undos.push(undo));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await this.rollbackTransaction(client);
      for (const undo of undos.reverse()) await undo().catch(() => undefined);
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

    await this.ensureNumericIdStorage(queryRunner);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_requests_status_updated
      ON psf_requests (status, updated_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_requests_requester_user_id
      ON psf_requests (requester_user_id)
    `);
  }

  // Imported Requests keep the ID of their PSF-NNNNNN number; any other
  // request takes the next ID in creation order. The sequence never moves
  // back, so a deleted Draft's ID (and NAS folder name) is not reused.
  private async ensureNumericIdStorage(queryRunner: QueryRunner) {
    await queryRunner.query(
      `ALTER TABLE psf_requests ADD COLUMN IF NOT EXISTS numeric_id INTEGER`,
    );
    await queryRunner.query(`
      UPDATE psf_requests AS request
      SET numeric_id = numbered.numeric_id
      FROM (
        SELECT DISTINCT ON (SUBSTRING(request_no FROM 5)::int)
          id, SUBSTRING(request_no FROM 5)::int AS numeric_id
        FROM psf_requests
        WHERE request_no ~ '^PSF-[0-9]{1,9}$' AND numeric_id IS NULL
        ORDER BY SUBSTRING(request_no FROM 5)::int, created_at, id
      ) AS numbered
      WHERE request.id = numbered.id AND request.numeric_id IS NULL
    `);
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS ${NUMERIC_ID_SEQUENCE}`,
    );
    await queryRunner.query(`
      SELECT setval('${NUMERIC_ID_SEQUENCE}', GREATEST(highest, 1), highest > 0)
      FROM (
        SELECT GREATEST(
          (SELECT COALESCE(MAX(numeric_id), 0) FROM psf_requests),
          (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM ${NUMERIC_ID_SEQUENCE})
        ) AS highest
      ) AS current_ids
    `);
    await queryRunner.query(`
      UPDATE psf_requests AS request
      SET numeric_id = numbered.numeric_id
      FROM (
        SELECT id, nextval('${NUMERIC_ID_SEQUENCE}') AS numeric_id
        FROM (
          SELECT id FROM psf_requests
          WHERE numeric_id IS NULL
          ORDER BY created_at, id
        ) AS unnumbered
      ) AS numbered
      WHERE request.id = numbered.id
    `);
    await queryRunner.query(`
      ALTER TABLE psf_requests
      ALTER COLUMN numeric_id SET DEFAULT nextval('${NUMERIC_ID_SEQUENCE}'),
      ALTER COLUMN numeric_id SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_psf_requests_numeric_id
      ON psf_requests (numeric_id)
    `);
  }

  private async nextDraftRequestNo(
    queryRunner: QueryRunner = this.pool,
  ): Promise<string> {
    const result = await queryRunner.query<{ next: string }>(`
      SELECT 'DRAFT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
             LPAD((COALESCE(MAX(SUBSTRING(request_no FROM 16)::INT),0) + 1)::TEXT, 4, '0') AS next
      FROM (SELECT request_no FROM psf_requests UNION ALL SELECT draft_no AS request_no FROM draft_deletion_logs) identifiers
      WHERE request_no ~ ('^DRAFT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-[0-9]+$')
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
      if (field.type === 'number' && !isNumericText(value)) {
        throw new BadRequestException(`${field.label} must be a number.`);
      }
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
              (field.type === 'number' && !isNumericText(value.trim())) ||
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
      numericId: row.numeric_id,
      requestNo: row.request_no,
      formKey: row.form_key,
      formVersion: row.form_version,
      status: row.status,
      requester: row.requester,
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

  private fieldChangesMetadata(
    schema: FormSchemaJson,
    before: RequesterData,
    after: RequesterData,
  ): { fieldChanges?: ReturnType<RequestsService['getFieldChanges']> } {
    const fieldChanges = this.getFieldChanges(schema, before, after);
    return fieldChanges.length > 0 ? { fieldChanges } : {};
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
        // An empty value and a missing one are the same to a reader.
        const valueOrNull = (data: RequesterData): unknown =>
          Object.hasOwn(data, field.fieldKey) && data[field.fieldKey] !== ''
            ? (data[field.fieldKey] ?? null)
            : null;
        const previous = valueOrNull(before);
        const next = valueOrNull(after);
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
