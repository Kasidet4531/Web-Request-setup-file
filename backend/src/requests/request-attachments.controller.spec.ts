import { INestApplication } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import {
  RequestAttachmentsController,
  attachmentUploadOptions,
} from './request-attachments.controller';
import { RequestAttachmentsService } from './request-attachments.service';

const actor = {
  id: '00000000-0000-4000-8000-000000000101',
  username: 'requester',
  displayName: 'Requester',
  role: 'requester' as const,
  setupOwnerDepartment: null,
};

describe('RequestAttachmentsController over HTTP', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  let directory: string;
  let sessionUserId: string | undefined;
  const attachments = {
    list: jest.fn(),
    upload: jest.fn(),
    delete: jest.fn(),
    download: jest.fn(),
  };
  const authService = { getProfile: jest.fn() };

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'attachment-http-'));
    const moduleRef = await Test.createTestingModule({
      imports: [
        MulterModule.register(attachmentUploadOptions({ maxBytes: 8 })),
      ],
      controllers: [RequestAttachmentsController],
      providers: [
        { provide: RequestAttachmentsService, useValue: attachments },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { session: unknown }).session = {
        userId: sessionUserId,
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.resetAllMocks();
    sessionUserId = actor.id;
    authService.getProfile.mockResolvedValue(actor);
  });

  it('passes every uploaded file with its UTF-8 name to the service', async () => {
    attachments.upload.mockResolvedValue({
      folderName: 'Chip A_5571',
      canManage: true,
      items: [],
    });

    await request(server())
      .post('/requests/request-1/attachments')
      .attach('files', Buffer.from('dpl'), 'ผังชิป.dpl')
      .attach('files', Buffer.from('lay'), 'job.lay')
      .expect(201)
      .expect({ folderName: 'Chip A_5571', canManage: true, items: [] });

    const [requestId, files, uploader] = attachments.upload.mock.calls[0] as [
      string,
      Array<{ originalname: string; buffer: Buffer }>,
      unknown,
    ];
    expect(requestId).toBe('request-1');
    expect(
      files.map((file) => [file.originalname, file.buffer.toString()]),
    ).toEqual([
      ['ผังชิป.dpl', 'dpl'],
      ['job.lay', 'lay'],
    ]);
    expect(uploader).toEqual(actor);
  });

  it('refuses a file over ATTACHMENT_MAX_BYTES with 413 before the service', async () => {
    await request(server())
      .post('/requests/request-1/attachments')
      .attach('files', Buffer.from('nine byte'), 'big.txt')
      .expect(413);
    expect(attachments.upload).not.toHaveBeenCalled();
  });

  it('serves a download as an attachment under its UTF-8 name, never as page content', async () => {
    const path = join(directory, 'stored.png');
    await writeFile(path, 'png-bytes');
    attachments.download.mockResolvedValue({
      path,
      filename: 'ผัง "chip".png',
      mimeType: 'image/png',
      sizeBytes: 9,
    });

    const response = await request(server())
      .get('/requests/request-1/attachments/attachment-1/download')
      .expect(200);

    expect(attachments.download).toHaveBeenCalledWith(
      'request-1',
      'attachment-1',
      actor,
    );
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="___ _chip_.png"; filename*=UTF-8''%E0%B8%9C%E0%B8%B1%E0%B8%87%20%22chip%22.png`,
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.from(response.body as Buffer).toString()).toBe('png-bytes');
  });

  it('requires a signed-in user for every Attachment route', async () => {
    sessionUserId = undefined;
    await request(server()).get('/requests/request-1/attachments').expect(401);
    await request(server())
      .delete('/requests/request-1/attachments/attachment-1')
      .expect(401);
    expect(attachments.list).not.toHaveBeenCalled();
    expect(attachments.delete).not.toHaveBeenCalled();
  });
});
