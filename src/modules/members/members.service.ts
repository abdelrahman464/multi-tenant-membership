import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateMemberDto } from './dto/create-member.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersRepository } from './repository/members.repository';

@Injectable()
export class MembersService {
  constructor(private readonly membersRepository: MembersRepository) {}

  list(actor: AuthenticatedUser, query: ListMembersQueryDto) {
    return this.membersRepository.findMany(actor.tenantId, query);
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const member = await this.membersRepository.findById(actor.tenantId, id);
    if (!member) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.MEMBER_NOT_FOUND,
        'Member not found',
      );
    }
    return member;
  }

  async create(actor: AuthenticatedUser, dto: CreateMemberDto) {
    try {
      return await this.membersRepository.create(actor.tenantId, {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        homeBranchId: dto.homeBranchId,
        notes: dto.notes,
      });
    } catch (error) {
      if (this.membersRepository.isUniqueConflict(error)) {
        throw this.membersRepository.phoneTakenError();
      }
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateMemberDto) {
    try {
      const member = await this.membersRepository.update(actor.tenantId, id, {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        homeBranchId: dto.homeBranchId,
        notes: dto.notes,
        status: dto.status,
      });
      if (!member) {
        throw new AppHttpException(
          HttpStatus.NOT_FOUND,
          ErrorCode.MEMBER_NOT_FOUND,
          'Member not found',
        );
      }
      return member;
    } catch (error) {
      if (this.membersRepository.isUniqueConflict(error)) {
        throw this.membersRepository.phoneTakenError();
      }
      throw error;
    }
  }
}
