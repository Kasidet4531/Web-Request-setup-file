import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RequestsModule } from '../requests/requests.module';
import { ExcelExportService } from './excel_export.service';
import { ExportController } from './export.controller';

@Module({
  imports: [AuthModule, RequestsModule],
  providers: [ExcelExportService],
  controllers: [ExportController],
  exports: [ExcelExportService],
})
export class ExportModule {}
