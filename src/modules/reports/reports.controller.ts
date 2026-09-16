import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { ExportCheckInsQueryDto } from './dto/export-check-ins-query.dto';
import { ExportMembersQueryDto } from './dto/export-members-query.dto';
import { ExportPaymentsQueryDto } from './dto/export-payments-query.dto';
import { ExportSubscriptionsQueryDto } from './dto/export-subscriptions-query.dto';
import { ReportsService } from './reports.service';
import { applyCsvDownloadHeaders } from './utils/csv.util';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('members')
  @Audit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: 'report',
    metadata: { resource: 'members' },
  })
  async members(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ExportMembersQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const download = await this.reportsService.members(actor, query);
    applyCsvDownloadHeaders(res, download.filename);
    return download.file;
  }

  @Get('payments')
  @Audit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: 'report',
    metadata: { resource: 'payments' },
  })
  async payments(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ExportPaymentsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const download = await this.reportsService.payments(actor, query);
    applyCsvDownloadHeaders(res, download.filename);
    return download.file;
  }

  @Get('checkIns')
  @Audit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: 'report',
    metadata: { resource: 'checkIns' },
  })
  async checkIns(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ExportCheckInsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const download = await this.reportsService.checkIns(actor, query);
    applyCsvDownloadHeaders(res, download.filename);
    return download.file;
  }

  @Get('subscriptions')
  @Audit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: 'report',
    metadata: { resource: 'subscriptions' },
  })
  async subscriptions(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ExportSubscriptionsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const download = await this.reportsService.subscriptions(actor, query);
    applyCsvDownloadHeaders(res, download.filename);
    return download.file;
  }
}
