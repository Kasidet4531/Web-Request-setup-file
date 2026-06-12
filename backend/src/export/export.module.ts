import { Module } from '@nestjs/common';
import { ExcelExportService } from './excel_export.service';
import { ExportController } from './export.controller';

@Module({
  providers: [ExcelExportService],
  controllers: [ExportController],
  exports: [ExcelExportService],
})
export class ExportModule {}
