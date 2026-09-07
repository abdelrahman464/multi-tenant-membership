import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffRepository } from './repository/staff.repository';

@Module({
  imports: [SecurityModule],
  controllers: [StaffController],
  providers: [StaffService, StaffRepository],
  exports: [StaffRepository],
})
export class StaffModule {}
