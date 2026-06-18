import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { SearchIndexService } from './search-index.service';
import { AutofillService } from './autofill.service';

@Module({
  imports: [AdminModule],
  providers: [RequestsService, SearchIndexService, AutofillService],
  controllers: [RequestsController],
  exports: [RequestsService, SearchIndexService, AutofillService],
})
export class RequestsModule {}
