import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsService } from './requests.service';
import { AdminDraftsController } from './admin-drafts.controller';
import { RequestsController } from './requests.controller';
import { SearchIndexService } from './search-index.service';
import { AutofillService } from './autofill.service';
import { AutofillController } from './autofill.controller';
import { AttachmentStorage } from './attachment-storage';
import { AttachmentPolicyController } from './attachment-policy.controller';
import { RequestAttachmentsService } from './request-attachments.service';
import {
  RequestAttachmentsController,
  attachmentUploadOptions,
} from './request-attachments.controller';

const attachmentStorage = (config: ConfigService) =>
  new AttachmentStorage({
    ATTACHMENT_STORAGE_PATH: config.get<string>('ATTACHMENT_STORAGE_PATH'),
    ATTACHMENT_MAX_BYTES: config.get<string>('ATTACHMENT_MAX_BYTES'),
  });

@Module({
  imports: [
    AdminModule,
    AuthModule,
    AuditModule,
    NotificationsModule,
    ConfigModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        attachmentUploadOptions(attachmentStorage(config)),
    }),
  ],
  providers: [
    {
      provide: AttachmentStorage,
      inject: [ConfigService],
      useFactory: attachmentStorage,
    },
    RequestsService,
    SearchIndexService,
    AutofillService,
    RequestAttachmentsService,
  ],
  controllers: [
    RequestsController,
    AutofillController,
    AdminDraftsController,
    RequestAttachmentsController,
    AttachmentPolicyController,
  ],
  exports: [RequestsService, SearchIndexService, AutofillService],
})
export class RequestsModule {}
