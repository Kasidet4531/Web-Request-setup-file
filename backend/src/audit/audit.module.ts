import { Module } from '@nestjs/common';
import { AuditLogService } from './audit_log.service';

@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
