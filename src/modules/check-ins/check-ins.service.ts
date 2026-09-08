import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { ListCheckInsQueryDto } from './dto/list-check-ins-query.dto';
import { CheckInsRepository } from './repository/check-ins.repository';

@Injectable()
export class CheckInsService {
  constructor(private readonly checkInsRepository: CheckInsRepository) {}

  list(actor: AuthenticatedUser, query: ListCheckInsQueryDto) {
    return this.checkInsRepository.findMany(actor.tenantId, query);
  }

  create(actor: AuthenticatedUser, dto: CreateCheckInDto) {
    return this.checkInsRepository.create(actor, {
      memberId: dto.memberId,
      branchId: dto.branchId,
      subscriptionId: dto.subscriptionId,
    });
  }
}
