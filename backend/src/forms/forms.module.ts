import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { FormsController } from './forms.controller';

@Module({
  imports: [AdminModule],
  controllers: [FormsController],
})
export class FormsModule {}
