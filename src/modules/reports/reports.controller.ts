import { Controller, Get, Query } from '@nestjs/common';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { ExportCheckInsQueryDto } from './dto/export-check-ins-query.dto';
import { ExportMembersQueryDto } from './dto/export-members-query.dto';
import { ExportPaymentsQueryDto } from './dto/export-payments-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('members')
  @Audit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: 'report',
    metadata: { resource: 'members' },
  })
  members(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ExportMembersQueryDto,
  ) {
    return this.reportsService.members(actor, query);
  }

  @Get('payments')
  @Audit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: 'report',
    metadata: { resource: 'payments' },
  })
  payments(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ExportPaymentsQueryDto,
  ) {
    return this.reportsService.payments(actor, query);
  }

  @Get('checkIns')
  @Audit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: 'report',
    metadata: { resource: 'checkIns' },
  })
  checkIns(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ExportCheckInsQueryDto,
  ) {
    return this.reportsService.checkIns(actor, query);
  }
}
