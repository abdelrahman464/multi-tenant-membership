import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { MembersRepository } from './repository/members.repository';

@Module({
  controllers: [MembersController],
  providers: [MembersService, MembersRepository],
})
export class MembersModule {}
