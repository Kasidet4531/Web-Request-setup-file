import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { RequestsModule } from '../requests/requests.module';
import { ExcelExportService } from './excel_export.service';
import { ExportController } from './export.controller';
import { ExportJobProcessor } from './export-job.processor';
import { ExportJobRepository } from './export-job.repository';

@Module({
  imports: [AdminModule, AuthModule, RequestsModule],
  providers: [ExcelExportService, ExportJobRepository, ExportJobProcessor],
  controllers: [ExportController],
  exports: [ExcelExportService],
})
export class ExportModule {}
