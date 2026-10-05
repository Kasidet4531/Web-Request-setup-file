import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { MailConfig } from './mail.config';
import { NotificationStorage } from './notification.storage';
import { NotificationService } from './notification.service';
import { NotificationDispatcher } from './notification.dispatcher';
import { NotificationWorker } from './notification.worker';
import { NotificationsController } from './notifications.controller';
@Module({
  imports: [AuthModule, ConfigModule],
  providers: [
    {
      provide: MailConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new MailConfig(
          Object.fromEntries(
            [
              'NODE_ENV',
              'MAIL_ENABLED',
              'MAIL_SOAP_URL',
              'MAIL_SYSTEM_NAME',
              'MAIL_SMTP_SERVER',
              'MAIL_SMTP_PORT',
              'MAIL_DEFAULT_TO',
              'MAIL_ADMIN_TO',
              'MAIL_REDIRECT_TO',
              'MAIL_POLL_INTERVAL_MS',
              'MAIL_TIMEOUT_MS',
              'APP_BASE_URL',
            ].map((key) => [key, config.get<string>(key)]),
          ),
        ),
    },
    NotificationStorage,
    NotificationService,
    NotificationDispatcher,
    NotificationWorker,
  ],
  controllers: [NotificationsController],
  exports: [NotificationService],
})
export class NotificationsModule {}
