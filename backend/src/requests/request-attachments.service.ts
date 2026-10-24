import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { stat } from 'node:fs/promises';
import { Pool, PoolClient } from 'pg';
import {
  AuditLogService,
  REQUEST_AUDIT_ACTION,
} from '../audit/audit_log.service';
import type { AuthenticatedUserProfile } from '../auth/session.types';
import { DATABASE_POOL } from '../database/database.service';
import {
  type AttachmentCategory,
  attachmentCategory,
} from './attachment-category';
import {
  AttachmentStorage,
  attachmentMimeType,
  isImageFilename,
  requestFolderName,
  sanitizeAttachmentFilename,
} from './attachment-storage';

type QueryRunner = Pick<Pool | PoolClient, 'query'>;
export type RegisterUndo = (undo: () => Promise<void>) => void;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UploadedAttachmentFile {
  originalname: string;
  buffer: Buffer;
}

export interface RequestAttachmentResponse {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  /** From the file name (ADR 0022), so every screen groups files alike. */
  category: AttachmentCategory;
  uploadedByDisplayName: string | null;
  createdAt: string;
}

export interface RequestAttachmentsResponse {
  folderName: string;
  canManage: boolean;
  items: RequestAttachmentResponse[];
}

export interface AttachmentDownload {
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface AttachmentRequestRow {
  id: string;
  status: string;
  requester_user_id: string | null;
  numeric_id: number;
  title: string | null;
}

interface AttachmentRow {
  id: string;
  filename: string;
  relative_path: string;
  mime_type: string;
  size_bytes: string | number;
  uploaded_by_display_name: string | null;
  created_at: Date | string;
}

/**
 * Attachments shared by everyone who can see a request. Files live in the
 * request's NAS folder; `psf_request_attachments` holds their metadata and is
 * reconciled with the folder whenever the list is read.
 */
@Injectable()
export class RequestAttachmentsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RequestAttachmentsService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly storage: AttachmentStorage,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Reports the storage at startup without stopping the app; Attachment
  // routes keep refusing work until the folder can be reached.
  async onApplicationBootstrap(): Promise<void> {
    if (!this.storage.configured) {
      this.logger.warn(
        'ATTACHMENT_STORAGE_PATH is not set; Attachments are disabled.',
      );
      return;
    }
    try {
      await this.storage.assertReachable();
      this.logger.log(`Attachment storage: ${this.storage.rootPath}`);
    } catch {
      this.logger.error(
        `Attachment storage ${this.storage.rootPath} cannot be reached. A drive letter mapped in a user's logon (such as Z:) is not visible to a backend running as a Windows service: use the UNC path (\\\\server\\share\\folder) or run the service as an account that maps the drive.`,
      );
    }
  }

  async ensureStorage(client: QueryRunner): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS psf_request_attachments (
        id UUID PRIMARY KEY,
        request_id UUID NOT NULL REFERENCES psf_requests(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        uploaded_by_user_id UUID NULL,
        uploaded_by_display_name TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (request_id, filename)
      )
    `);
  }

  async list(
    requestId: string,
    actor: AuthenticatedUserProfile,
  ): Promise<RequestAttachmentsResponse> {
    await this.storage.assertReachable();
    return this.withTransaction(async (client) => {
      const request = await this.lockRequest(client, requestId);
      this.assertCanView(request, actor);
      const folder = this.folderOf(request);
      const items = await this.reconcile(client, request.id, folder);
      return {
        folderName: folder,
        canManage: this.canManage(request, actor),
        items,
      };
    });
  }

  async upload(
    requestId: string,
    files: UploadedAttachmentFile[],
    actor: AuthenticatedUserProfile,
  ): Promise<RequestAttachmentsResponse> {
    if (files.length === 0)
      throw new BadRequestException('Choose at least one file to attach.');
    const accepted = files.map((file) => {
      const filename = sanitizeAttachmentFilename(file.originalname);
      if (file.buffer.length > this.storage.maxBytes)
        throw new PayloadTooLargeException(
          `${filename} is larger than the ${this.storage.maxBytes} byte attachment limit.`,
        );
      return { filename, content: file.buffer };
    });
    await this.storage.assertReachable();
    await this.withTransaction(async (client, onRollback) => {
      const request = await this.lockRequest(client, requestId);
      this.assertCanView(request, actor);
      this.assertCanManage(request, actor);
      const folder = this.folderOf(request);
      for (const file of accepted) {
        const filename = await this.storage.saveFile(
          folder,
          file.filename,
          file.content,
        );
        onRollback(() => this.storage.deleteFile(folder, filename));
        const mimeType = attachmentMimeType(filename);
        // The file was just created, so a row for this name is stale.
        await client.query(
          `
            INSERT INTO psf_request_attachments (
              id, request_id, filename, relative_path, mime_type, size_bytes,
              uploaded_by_user_id, uploaded_by_display_name, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (request_id, filename) DO UPDATE SET
              id = EXCLUDED.id,
              relative_path = EXCLUDED.relative_path,
              mime_type = EXCLUDED.mime_type,
              size_bytes = EXCLUDED.size_bytes,
              uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
              uploaded_by_display_name = EXCLUDED.uploaded_by_display_name,
              created_at = EXCLUDED.created_at
          `,
          [
            randomUUID(),
            request.id,
            filename,
            `${folder}/${filename}`,
            mimeType,
            file.content.length,
            actor.id,
            actor.displayName,
          ],
        );
        await this.auditLogService.record(
          {
            requestId: request.id,
            actionType: REQUEST_AUDIT_ACTION.ATTACHMENT_UPLOADED,
            actor,
            metadata: {
              filename,
              sizeBytes: file.content.length,
              mimeType,
            },
            requestSnapshot: false,
          },
          client,
        );
      }
    });
    return this.list(requestId, actor);
  }

  async delete(
    requestId: string,
    attachmentId: string,
    actor: AuthenticatedUserProfile,
  ): Promise<{ deleted: true }> {
    await this.storage.assertReachable();
    return this.withTransaction(async (client) => {
      const request = await this.lockRequest(client, requestId);
      this.assertCanView(request, actor);
      this.assertCanManage(request, actor);
      const attachment = await this.findAttachment(
        client,
        request.id,
        attachmentId,
      );
      await client.query('DELETE FROM psf_request_attachments WHERE id = $1', [
        attachment.id,
      ]);
      await this.auditLogService.record(
        {
          requestId: request.id,
          actionType: REQUEST_AUDIT_ACTION.ATTACHMENT_DELETED,
          actor,
          metadata: {
            filename: attachment.filename,
            sizeBytes: Number(attachment.size_bytes),
            mimeType: attachment.mime_type,
          },
          requestSnapshot: false,
        },
        client,
      );
      // Last, so a refused delete on the NAS keeps the row.
      await this.storage.deleteFile(
        this.folderOf(request),
        attachment.filename,
      );
      return { deleted: true as const };
    });
  }

  async download(
    requestId: string,
    attachmentId: string,
    actor: AuthenticatedUserProfile,
  ): Promise<AttachmentDownload> {
    await this.storage.assertReachable();
    const request = await this.findRequest(this.pool, requestId);
    this.assertCanView(request, actor);
    const attachment = await this.findAttachment(
      this.pool,
      request.id,
      attachmentId,
    );
    const path = this.storage.filePath(
      this.folderOf(request),
      attachment.filename,
    );
    try {
      const info = await stat(path);
      if (info.isFile())
        return {
          path,
          filename: attachment.filename,
          mimeType: attachment.mime_type,
          sizeBytes: info.size,
        };
    } catch {
      // Reported below.
    }
    throw new NotFoundException(
      `${attachment.filename} is no longer in the request folder on the NAS.`,
    );
  }

  /**
   * Called inside the request save that changed Product_Description, after
   * its row is updated; the rename is undone if that save rolls back.
   */
  async renameRequestFolder(
    client: QueryRunner,
    request: { id: string; numericId: number },
    beforeProductDescription: unknown,
    afterProductDescription: unknown,
    onRollback: RegisterUndo,
  ): Promise<void> {
    const from = requestFolderName(beforeProductDescription, request.numericId);
    const to = requestFolderName(afterProductDescription, request.numericId);
    if (from === to || !this.storage.configured) return;
    await this.storage.assertReachable();
    onRollback(await this.storage.renameFolder(from, to));
    await client.query(
      `UPDATE psf_request_attachments SET relative_path = $2 || '/' || filename WHERE request_id = $1`,
      [request.id, to],
    );
  }

  /** Checked before a permanent Draft deletion, so an offline NAS refuses it. */
  async assertFolderRemovable(): Promise<void> {
    if (this.storage.configured) await this.storage.assertReachable();
  }

  /** Called after a permanent Draft deletion committed; failures are logged. */
  async removeRequestFolder(
    productDescription: unknown,
    numericId: number,
  ): Promise<void> {
    if (!this.storage.configured) return;
    const folder = requestFolderName(productDescription, numericId);
    try {
      await this.storage.removeFolder(folder);
    } catch (error) {
      this.logger.warn(
        `Draft folder ${folder} could not be removed from attachment storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async reconcile(
    client: QueryRunner,
    requestId: string,
    folder: string,
  ): Promise<RequestAttachmentResponse[]> {
    const files = new Map(
      (await this.storage.listFiles(folder)).map((file) => [
        file.filename,
        file,
      ]),
    );
    const rows = (
      await client.query<AttachmentRow>(
        'SELECT * FROM psf_request_attachments WHERE request_id = $1',
        [requestId],
      )
    ).rows;
    const tracked = new Set<string>();
    for (const row of rows) {
      const file = files.get(row.filename);
      tracked.add(row.filename);
      if (!file) {
        await client.query(
          'DELETE FROM psf_request_attachments WHERE id = $1',
          [row.id],
        );
      } else if (
        Number(row.size_bytes) !== file.sizeBytes ||
        row.relative_path !== `${folder}/${row.filename}`
      ) {
        await client.query(
          'UPDATE psf_request_attachments SET size_bytes = $2, relative_path = $3 WHERE id = $1',
          [row.id, file.sizeBytes, `${folder}/${row.filename}`],
        );
      }
    }
    for (const file of files.values()) {
      if (tracked.has(file.filename)) continue;
      // Placed on the NAS directly, e.g. an Imported Request's existing files.
      await client.query(
        `
          INSERT INTO psf_request_attachments (
            id, request_id, filename, relative_path, mime_type, size_bytes, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (request_id, filename) DO NOTHING
        `,
        [
          randomUUID(),
          requestId,
          file.filename,
          `${folder}/${file.filename}`,
          attachmentMimeType(file.filename),
          file.sizeBytes,
          file.modifiedAt,
        ],
      );
    }
    const current = await client.query<AttachmentRow>(
      'SELECT * FROM psf_request_attachments WHERE request_id = $1 ORDER BY created_at ASC, filename ASC',
      [requestId],
    );
    return current.rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      isImage: isImageFilename(row.filename),
      category: attachmentCategory(row.filename),
      uploadedByDisplayName: row.uploaded_by_display_name,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    }));
  }

  // Shares the row with other Attachment changes but waits for a save that
  // renames the folder, so no file lands in a folder being renamed.
  private lockRequest(
    client: QueryRunner,
    requestId: string,
  ): Promise<AttachmentRequestRow> {
    return this.findRequest(client, requestId, 'FOR SHARE');
  }

  private async findRequest(
    client: QueryRunner,
    requestId: string,
    lock = '',
  ): Promise<AttachmentRequestRow> {
    const result = UUID_PATTERN.test(requestId)
      ? await client.query<AttachmentRequestRow>(
          `
            SELECT id, status, requester_user_id, numeric_id,
                   requester_data_json->>'title' AS title
            FROM psf_requests
            WHERE id = $1
            ${lock}
          `,
          [requestId],
        )
      : { rows: [] };
    const request = result.rows[0];
    if (!request)
      throw new NotFoundException(`PSF request ${requestId} was not found`);
    return request;
  }

  private async findAttachment(
    client: QueryRunner,
    requestId: string,
    attachmentId: string,
  ): Promise<AttachmentRow> {
    const result = UUID_PATTERN.test(attachmentId)
      ? await client.query<AttachmentRow>(
          'SELECT * FROM psf_request_attachments WHERE id = $1 AND request_id = $2',
          [attachmentId, requestId],
        )
      : { rows: [] };
    const attachment = result.rows[0];
    if (!attachment) throw new NotFoundException('Attachment was not found.');
    return attachment;
  }

  private folderOf(request: AttachmentRequestRow): string {
    return requestFolderName(request.title, request.numeric_id);
  }

  // Draft privacy as for the request itself, plus Admin read-only inspection.
  private assertCanView(
    request: AttachmentRequestRow,
    actor: AuthenticatedUserProfile,
  ): void {
    if (
      request.status === 'Draft' &&
      request.requester_user_id !== actor.id &&
      actor.role !== 'admin'
    )
      throw new ForbiddenException(
        'Draft requests are private to their creator.',
      );
  }

  private canManage(
    request: AttachmentRequestRow,
    actor: AuthenticatedUserProfile,
  ): boolean {
    return request.status !== 'Draft' || request.requester_user_id === actor.id;
  }

  private assertCanManage(
    request: AttachmentRequestRow,
    actor: AuthenticatedUserProfile,
  ): void {
    if (!this.canManage(request, actor))
      throw new ForbiddenException(
        'Only the Draft creator can change its Attachments.',
      );
  }

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
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original error.
      }
      for (const undo of undos.reverse()) await undo().catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
