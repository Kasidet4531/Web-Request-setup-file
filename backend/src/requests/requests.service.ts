import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import {
  FormSchemaJson,
  FormSchemaService,
} from '../admin/form_schema.service';
import { DATABASE_POOL } from '../database/database.service';
import {
  RequestSearchFilters,
  RequestSearchResult,
  SearchIndexService,
} from './search-index.service';

const PSF_REQUEST_FORM_KEY = 'psf-request';
const DRAFT_STATUS = 'Draft';
const SUBMITTED_STATUS = 'Submitted';
const SETUP_IN_PROGRESS_STATUS = 'Setup In Progress';
const NEED_MORE_INFORMATION_STATUS = 'Need More Information';
const PSF_CREATED_STATUS = 'PSF Created';
const COMPLETED_STATUS = 'Completed';
const REJECTED_STATUS = 'Rejected';
const CANCELLED_STATUS = 'Cancelled';

const STATUS_TRANSITIONS_BY_ROLE: Record<string, Record<string, string[]>> = {
  requester: {
    [SUBMITTED_STATUS]: [CANCELLED_STATUS],
    [NEED_MORE_INFORMATION_STATUS]: [SUBMITTED_STATUS, CANCELLED_STATUS],
  },
  setup_owner: {
    [SUBMITTED_STATUS]: [
      SETUP_IN_PROGRESS_STATUS,
      NEED_MORE_INFORMATION_STATUS,
      REJECTED_STATUS,
    ],
    [SETUP_IN_PROGRESS_STATUS]: [
      PSF_CREATED_STATUS,
      NEED_MORE_INFORMATION_STATUS,
      REJECTED_STATUS,
    ],
    [PSF_CREATED_STATUS]: [COMPLETED_STATUS, NEED_MORE_INFORMATION_STATUS],
  },
};

const ALL_MANUAL_STATUSES = [
  SUBMITTED_STATUS,
  SETUP_IN_PROGRESS_STATUS,
  NEED_MORE_INFORMATION_STATUS,
  PSF_CREATED_STATUS,
  COMPLETED_STATUS,
  REJECTED_STATUS,
  CANCELLED_STATUS,
];

const REQUEST_UPDATED_AT_VERSION_SQL = `TO_CHAR(
  updated_at AT TIME ZONE current_setting('TIMEZONE') AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
)`;

const PSF_CREATED_INFORMATION_SCHEMA: FormSchemaJson = {
  formKey: 'psf-created-information',
  version: 1,
  title: 'PSF Created Information',
  sections: [
    {
      sectionKey: 'psf_created_information',
      title: 'PSF Created Information',
      visibleTo: ['requester', 'setup_owner', 'admin'],
      fields: [
        {
          fieldKey: 'first_die_ref_xy',
          canonicalKey: 'first_die_ref_xy',
          label: 'First Die Ref. (X,Y)',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'probe_coordinate_quadrant',
          canonicalKey: 'probe_coordinate_quadrant',
          label: 'Probe & Coordinate Quadrant',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'wafer_id_format',
          canonicalKey: 'wafer_id_format',
          label: 'Wafer ID Format',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'mirror_die_available',
          canonicalKey: 'mirror_die_available',
          label: 'Mirror Die Available',
          type: 'select',
          required: false,
          options: ['Yes', 'No'],
        },
        {
          fieldKey: 'prepare_fpc_and_physical_wafer_to_psf_cabinet_e2',
          canonicalKey: 'prepare_fpc_and_physical_wafer_to_psf_cabinet_e2',
          label: 'Prepare FPC & Physical Wafer to PSF Cabinet E2',
          type: 'select',
          required: false,
          options: ['Yes', 'No'],
        },
        {
          fieldKey: 'psf_setup_file_name',
          canonicalKey: 'psf_setup_file_name',
          label: 'PSF Setup File Name',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'job_file_name',
          canonicalKey: 'job_file_name',
          label: 'Job File Name',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'template',
          canonicalKey: 'template',
          label: 'Template',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'layout',
          canonicalKey: 'layout',
          label: 'Layout',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'attachment_reference',
          canonicalKey: 'attachment_reference',
          label: 'Attachment Reference',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};

export type RequesterData = Record<string, unknown>;

export interface CreateDraftRequestDto {
  requester?: string;
  requesterData: RequesterData;
}

export interface UpdateDraftRequesterDataDto {
  requester?: string;
  requesterData: RequesterData;
}

export interface SubmitDraftRequestDto {
  formVersion: number;
}

export interface UpdateRequestStatusBodyDto {
  status: string;
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

export type RequestQueryDto = RequestSearchFilters;

export interface PsfRequestResponse {
  id: string;
  requestNo: string;
  formKey: string;
  formVersion: number;
  status: string;
  requester: string | null;
  setupOwner: string | null;
  setupOwnerRole: string | null;
  productType: string | null;
  requesterData: RequesterData;
  psfCreatedData: RequesterData;
  psfCreatedDataVisible: boolean;
  canEditPsfCreatedData: boolean;
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
  setup_owner: string | null;
  setup_owner_role: string | null;
  product_type: string | null;
  requester_data_json: RequesterData;
  psf_created_data_json: RequesterData;
  schema_snapshot_json: FormSchemaJson;
  created_at: Date | string;
  updated_at: Date | string;
  updated_at_version?: string;
  submitted_at: Date | string | null;
  psf_created_at: Date | string | null;
  completed_at: Date | string | null;
}

@Injectable()
export class RequestsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly formSchemaService: FormSchemaService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRequestsStorage();
  }

  async createDraft(dto: CreateDraftRequestDto): Promise<PsfRequestResponse> {
    const activeSchema =
      await this.formSchemaService.getActiveSchema(PSF_REQUEST_FORM_KEY);
    const requestNo = await this.nextDraftRequestNo();
    const requester = this.normalizeString(
      dto.requester ?? dto.requesterData.requester_name,
    );
    const productType = this.normalizeString(dto.requesterData.product_type);

    const result = await this.pool.query<PsfRequestRow>(
      `
        INSERT INTO psf_requests (
          id,
          request_no,
          form_key,
          form_version,
          status,
          requester,
          product_type,
          requester_data_json,
          psf_created_data_json,
          schema_snapshot_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, '{}'::jsonb, $9::jsonb, NOW(), NOW())
        RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
      `,
      [
        randomUUID(),
        requestNo,
        activeSchema.formKey,
        activeSchema.version,
        DRAFT_STATUS,
        requester,
        productType,
        dto.requesterData,
        activeSchema.schema,
      ],
    );

    return this.mapRequestRow(result.rows[0]);
  }

  async queryRequests(query: RequestQueryDto): Promise<RequestSearchResult> {
    return this.searchIndexService.queryRequests({
      ...query,
      limit: this.parseOptionalNumber(query.limit),
      offset: this.parseOptionalNumber(query.offset),
    });
  }

  async getRequest(
    id: string,
    actor?: AuthenticatedUserProfile,
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

    return this.mapRequestRow(request, actor);
  }

  async getAllowedStatusTransitions(
    id: string,
    actor: AuthenticatedUserProfile,
  ): Promise<RequestStatusOptionsResponse> {
    const current = await this.pool.query<Pick<PsfRequestRow, 'id' | 'status'>>(
      `
        SELECT id, status
        FROM psf_requests
        WHERE id = $1
      `,
      [id],
    );

    const request = current.rows[0];
    if (!request) {
      throw new NotFoundException(`PSF request ${id} was not found`);
    }

    return {
      allowedNextStatuses: this.getAllowedNextStatuses(
        actor.role,
        request.status,
      ),
    };
  }

  async updateDraftRequesterData(
    id: string,
    dto: UpdateDraftRequesterDataDto,
  ): Promise<PsfRequestResponse> {
    const current = await this.pool.query<Pick<PsfRequestRow, 'id' | 'status'>>(
      `
        SELECT id, status
        FROM psf_requests
        WHERE id = $1
      `,
      [id],
    );

    const request = current.rows[0];
    if (!request) {
      throw new NotFoundException(`PSF request ${id} was not found`);
    }

    if (request.status !== DRAFT_STATUS) {
      throw new ForbiddenException(
        'Requester-owned fields can only be edited while the request is Draft',
      );
    }

    const requester = this.normalizeString(
      dto.requester ?? dto.requesterData.requester_name,
    );
    const productType = this.normalizeString(dto.requesterData.product_type);

    const result = await this.pool.query<PsfRequestRow>(
      `
        UPDATE psf_requests
        SET requester = $2,
            product_type = $3,
            requester_data_json = $4::jsonb,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
      `,
      [id, requester, productType, dto.requesterData],
    );

    return this.mapRequestRow(result.rows[0]);
  }

  async updatePsfCreatedData(
    id: string,
    dto: UpdatePsfCreatedDataDto,
  ): Promise<PsfRequestResponse> {
    const current = await this.pool.query<
      Pick<PsfRequestRow, 'id' | 'status' | 'updated_at' | 'updated_at_version'>
    >(
      `
        SELECT id,
               status,
               updated_at,
               ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        FROM psf_requests
        WHERE id = $1
      `,
      [id],
    );

    const request = current.rows[0];
    if (!request) {
      throw new NotFoundException(`PSF request ${id} was not found`);
    }

    if (dto.actor.role === 'requester') {
      throw new ForbiddenException(
        'Only Setup File Owners and admins can edit PSF Created Information',
      );
    }

    if (
      dto.actor.role === 'setup_owner' &&
      request.status === COMPLETED_STATUS
    ) {
      throw new ForbiddenException(
        'Setup File Owners cannot edit PSF Created Information once the request is Completed',
      );
    }

    this.assertPsfCreatedDataPayload(dto.psfCreatedData);
    this.assertExpectedUpdatedAt(dto.expectedUpdatedAt);

    const currentUpdatedAt = request.updated_at_version ?? request.updated_at;
    if (dto.expectedUpdatedAt !== this.serializeTimestamp(currentUpdatedAt)) {
      throw new ConflictException(
        'The request changed before this update. Reload the request and try again.',
      );
    }

    const psfCreatedData = this.normalizePsfCreatedDataToSchema(
      dto.psfCreatedData,
    );
    const actorName =
      dto.actor.role === 'setup_owner' ? dto.actor.displayName : null;
    const actorDepartment =
      dto.actor.role === 'setup_owner' ? dto.actor.setupOwnerDepartment : null;
    const ownerCompletionGuard =
      dto.actor.role === 'setup_owner'
        ? `AND status <> '${COMPLETED_STATUS}'`
        : '';
    const result = await this.pool.query<PsfRequestRow>(
      `
        UPDATE psf_requests
        SET psf_created_data_json = $2::jsonb,
            setup_owner = COALESCE($3, setup_owner),
            setup_owner_role = COALESCE($4, setup_owner_role),
            updated_at = NOW()
        WHERE id = $1
          AND updated_at = ($5::timestamptz AT TIME ZONE current_setting('TIMEZONE'))
          ${ownerCompletionGuard}
        RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
      `,
      [id, psfCreatedData, actorName, actorDepartment, currentUpdatedAt],
    );

    const updatedRow = result.rows[0];
    if (!updatedRow) {
      throw new ConflictException(
        'The request changed before this update. Reload the request and try again.',
      );
    }

    return this.mapRequestRow(updatedRow, dto.actor);
  }

  async updateRequestStatus(
    id: string,
    dto: UpdateRequestStatusDto,
  ): Promise<PsfRequestResponse> {
    const current = await this.pool.query<Pick<PsfRequestRow, 'id' | 'status'>>(
      `
        SELECT id, status
        FROM psf_requests
        WHERE id = $1
      `,
      [id],
    );

    const currentRequest = current.rows[0];
    if (!currentRequest) {
      throw new NotFoundException(`PSF request ${id} was not found`);
    }

    this.assertStatusTransitionIsAllowed(
      dto.actor.role,
      currentRequest.status,
      dto.status,
    );

    const actorName =
      dto.actor.role === 'setup_owner' ? dto.actor.displayName : null;
    const actorDepartment =
      dto.actor.role === 'setup_owner' ? dto.actor.setupOwnerDepartment : null;

    const result = await this.pool.query<PsfRequestRow>(
      `
        UPDATE psf_requests
        SET status = $2,
            setup_owner = COALESCE($3, setup_owner),
            setup_owner_role = COALESCE($4, setup_owner_role),
            psf_created_at = CASE WHEN $2 = '${PSF_CREATED_STATUS}' THEN NOW() ELSE psf_created_at END,
            completed_at = CASE WHEN $2 = '${COMPLETED_STATUS}' THEN NOW() ELSE completed_at END,
            updated_at = NOW()
        WHERE id = $1
          AND status = $5
        RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
      `,
      [id, dto.status, actorName, actorDepartment, currentRequest.status],
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
    );

    return this.mapRequestRow(updatedRow, dto.actor);
  }

  async submitRequest(
    id: string,
    dto: SubmitDraftRequestDto,
  ): Promise<PsfRequestResponse> {
    const activeSchema =
      await this.formSchemaService.getActiveSchema(PSF_REQUEST_FORM_KEY);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const current = await client.query<
        Pick<PsfRequestRow, 'id' | 'status' | 'requester_data_json'>
      >(
        `
          SELECT id, status, requester_data_json
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

      if (request.status !== DRAFT_STATUS) {
        throw new ForbiddenException('Only Draft requests can be submitted');
      }

      if (activeSchema.version !== dto.formVersion) {
        throw new BadRequestException(
          'The active request schema changed before submit. Reload the draft and submit again.',
        );
      }
      const normalizedRequesterData = this.normalizeRequesterDataToSchema(
        activeSchema.schema,
        request.requester_data_json ?? {},
      );
      this.assertRequiredRequesterFieldsPresent(
        activeSchema.schema,
        normalizedRequesterData,
      );

      const requester = this.normalizeString(
        normalizedRequesterData.requester_name,
      );
      const productType = this.normalizeString(
        normalizedRequesterData.product_type,
      );
      const result = await client.query<PsfRequestRow>(
        `
          UPDATE psf_requests
          SET status = '${SUBMITTED_STATUS}',
              requester = $2,
              product_type = $3,
              requester_data_json = $4::jsonb,
              form_version = $5,
              schema_snapshot_json = $6::jsonb,
              submitted_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
          RETURNING *, ${REQUEST_UPDATED_AT_VERSION_SQL} AS updated_at_version
        `,
        [
          id,
          requester,
          productType,
          normalizedRequesterData,
          activeSchema.version,
          activeSchema.schema,
        ],
      );

      const submittedRow = result.rows[0];
      const canonicalValues =
        await this.searchIndexService.upsertSubmittedCanonicalValues(
          id,
          activeSchema.schema,
          normalizedRequesterData,
          client,
        );

      await this.searchIndexService.upsertRequestSearchIndex(
        {
          requestId: submittedRow.id,
          requestNo: submittedRow.request_no,
          status: submittedRow.status,
          requester: submittedRow.requester,
          setupOwner: submittedRow.setup_owner,
          setupOwnerRole: submittedRow.setup_owner_role,
          productType: submittedRow.product_type,
          requestDate: submittedRow.created_at,
          updatedAt: submittedRow.updated_at,
        },
        canonicalValues,
        client,
      );

      await client.query('COMMIT');

      return this.mapRequestRow(submittedRow);
    } catch (error) {
      await this.rollbackSubmitTransaction(client);
      throw error;
    } finally {
      client.release();
    }
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

  private assertStatusTransitionIsAllowed(
    role: AuthenticatedUserProfile['role'],
    currentStatus: string,
    nextStatus: string,
  ): void {
    if (currentStatus === DRAFT_STATUS) {
      if (nextStatus === DRAFT_STATUS) {
        return;
      }

      throw new ForbiddenException(
        'Draft requests must be submitted through the submit action',
      );
    }

    if (!ALL_MANUAL_STATUSES.includes(nextStatus)) {
      throw new BadRequestException(
        `Unsupported request status: ${nextStatus}`,
      );
    }

    if (nextStatus === currentStatus) {
      return;
    }

    if (role === 'admin') {
      return;
    }

    const allowedTargets = this.getAllowedNextStatuses(role, currentStatus);

    if (!allowedTargets.includes(nextStatus)) {
      throw new ForbiddenException(
        `${role} is not allowed to move a request from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private getAllowedNextStatuses(
    role: AuthenticatedUserProfile['role'],
    currentStatus: string,
  ): string[] {
    if (currentStatus === DRAFT_STATUS) {
      return [];
    }

    if (role === 'admin') {
      return ALL_MANUAL_STATUSES.filter((status) => status !== currentStatus);
    }

    return [...(STATUS_TRANSITIONS_BY_ROLE[role]?.[currentStatus] ?? [])];
  }

  private async rollbackSubmitTransaction(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original submit error if rollback also fails.
    }
  }

  private async ensureRequestsStorage(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS psf_requests (
        id UUID PRIMARY KEY,
        request_no TEXT NOT NULL UNIQUE,
        form_key TEXT NOT NULL,
        form_version INT NOT NULL,
        status TEXT NOT NULL,
        requester TEXT,
        setup_owner TEXT,
        setup_owner_role TEXT,
        product_type TEXT,
        requester_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        psf_created_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        schema_snapshot_json JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        submitted_at TIMESTAMP,
        psf_created_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_psf_requests_status_updated
      ON psf_requests (status, updated_at DESC)
    `);
  }

  private async nextDraftRequestNo(): Promise<string> {
    const result = await this.pool.query<{ next: string }>(`
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
  ): RequesterData {
    const nextData: RequesterData = {};

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (Object.hasOwn(requesterData, field.fieldKey)) {
          nextData[field.fieldKey] = requesterData[field.fieldKey];
        }
      });
    });

    return nextData;
  }

  private normalizePsfCreatedDataToSchema(
    psfCreatedData: RequesterData,
  ): RequesterData {
    const nextData: RequesterData = {};

    PSF_CREATED_INFORMATION_SCHEMA.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (!Object.hasOwn(psfCreatedData, field.fieldKey)) {
          return;
        }

        const value = this.normalizeString(psfCreatedData[field.fieldKey]);
        if (
          value === null ||
          (field.options && !field.options.includes(value))
        ) {
          return;
        }

        nextData[field.fieldKey] = value;
      });
    });

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
    if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) {
      throw new BadRequestException(
        'A valid request updatedAt value is required to save PSF Created Information.',
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

  private psfCreatedDataIsVisibleTo(
    status: string,
    actor?: AuthenticatedUserProfile,
  ): boolean {
    if (!actor) {
      return false;
    }

    return (
      actor.role !== 'requester' ||
      status === PSF_CREATED_STATUS ||
      status === COMPLETED_STATUS
    );
  }

  private canActorEditPsfCreatedData(
    status: string,
    actor?: AuthenticatedUserProfile,
  ): boolean {
    if (!actor) {
      return false;
    }

    return (
      actor.role === 'admin' ||
      (actor.role === 'setup_owner' && status !== COMPLETED_STATUS)
    );
  }

  private mapRequestRow(
    row: PsfRequestRow,
    actor?: AuthenticatedUserProfile,
  ): PsfRequestResponse {
    const psfCreatedDataVisible = this.psfCreatedDataIsVisibleTo(
      row.status,
      actor,
    );

    return {
      id: row.id,
      requestNo: row.request_no,
      formKey: row.form_key,
      formVersion: row.form_version,
      status: row.status,
      requester: row.requester,
      setupOwner: row.setup_owner,
      setupOwnerRole: row.setup_owner_role,
      productType: row.product_type,
      requesterData: row.requester_data_json ?? {},
      psfCreatedData: psfCreatedDataVisible
        ? (row.psf_created_data_json ?? {})
        : {},
      psfCreatedDataVisible,
      canEditPsfCreatedData: this.canActorEditPsfCreatedData(row.status, actor),
      psfCreatedInformationSchema: PSF_CREATED_INFORMATION_SCHEMA,
      schemaSnapshot: row.schema_snapshot_json,
      createdAt: this.serializeTimestamp(row.created_at),
      updatedAt:
        row.updated_at_version ?? this.serializeTimestamp(row.updated_at),
      submittedAt: this.serializeNullableTimestamp(row.submitted_at),
      psfCreatedAt: this.serializeNullableTimestamp(row.psf_created_at),
      completedAt: this.serializeNullableTimestamp(row.completed_at),
    };
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
