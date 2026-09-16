import { Controller, Get, Query } from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { StaffRole } from '../staff/enums/staff-role.enum';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(StaffRole.TENANT_OWNER, StaffRole.ADMIN)
  list(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListAuditQueryDto,
  ) {
    return this.auditService.list(actor, query);
  }
}
