import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { SearchIndexService } from './search-index.service';
import { AutofillService } from './autofill.service';

@Module({
  imports: [AdminModule, AuthModule, AuditModule],
  providers: [RequestsService, SearchIndexService, AutofillService],
  controllers: [RequestsController],
  exports: [RequestsService, SearchIndexService, AutofillService],
})
export class RequestsModule {}
