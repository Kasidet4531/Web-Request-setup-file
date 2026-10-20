import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { AuthService } from '../auth/auth.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUserProfile,
} from '../auth/session.types';
import type { AttachmentStorage } from './attachment-storage';
import {
  RequestAttachmentsService,
  type RequestAttachmentsResponse,
  type UploadedAttachmentFile,
} from './request-attachments.service';

export const MAX_ATTACHMENTS_PER_UPLOAD = 10;

// Uploads are held in memory up to ATTACHMENT_MAX_BYTES each (413 beyond it).
export function attachmentUploadOptions(
  storage: Pick<AttachmentStorage, 'maxBytes'>,
): MulterOptions {
  return {
    limits: { fileSize: storage.maxBytes },
    // Browsers send UTF-8 file names, e.g. Thai ones.
    defParamCharset: 'utf8',
  };
}

// RFC 6266: an ASCII fallback plus the exact UTF-8 name.
export function attachmentContentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

@Controller('requests/:requestId/attachments')
export class RequestAttachmentsController {
  constructor(
    private readonly requestAttachments: RequestAttachmentsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async list(
    @Param('requestId') requestId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestAttachmentsResponse> {
    const actor = await this.getAuthenticatedActor(request);
    return this.requestAttachments.list(requestId, actor);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('files', MAX_ATTACHMENTS_PER_UPLOAD))
  async upload(
    @Param('requestId') requestId: string,
    @UploadedFiles() files: UploadedAttachmentFile[] | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<RequestAttachmentsResponse> {
    const actor = await this.getAuthenticatedActor(request);
    return this.requestAttachments.upload(requestId, files ?? [], actor);
  }

  @Get(':attachmentId/download')
  async download(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const actor = await this.getAuthenticatedActor(request);
    const file = await this.requestAttachments.download(
      requestId,
      attachmentId,
      actor,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Opened directly, an uploaded SVG or HTML file must not run as this site.
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    );
    return new StreamableFile(createReadStream(file.path), {
      type: file.mimeType,
      length: file.sizeBytes,
      disposition: attachmentContentDisposition(file.filename),
    });
  }

  @Delete(':attachmentId')
  async delete(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ deleted: true }> {
    const actor = await this.getAuthenticatedActor(request);
    return this.requestAttachments.delete(requestId, attachmentId, actor);
  }

  private async getAuthenticatedActor(
    request: AuthenticatedRequest,
  ): Promise<AuthenticatedUserProfile> {
    const userId = request.session.userId;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const actor = await this.authService.getProfile(userId);

    if (!actor) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }

    return actor;
  }
}
