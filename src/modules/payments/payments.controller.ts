import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaymentsService } from './payments.service';
import { applyPdfDownloadHeaders } from './utils/receipt-pdf.util';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  list(
    @GetAuthUser() actor: AuthenticatedUser,
    @Query() query: ListPaymentsQueryDto,
  ) {
    return this.paymentsService.list(actor, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: AuditAction.PAYMENT_CREATED, entityType: 'payment' })
  create(
    @GetAuthUser() actor: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(actor, dto);
  }

  @Get(':id/receipt')
  @Audit({
    action: AuditAction.REPORT_EXPORTED,
    entityType: 'payment',
    metadata: { resource: 'paymentReceipt' },
  })
  async receipt(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const download = await this.paymentsService.receipt(actor, id);
    applyPdfDownloadHeaders(res, download.filename);
    return download.file;
  }

  @Get(':id')
  getById(
    @GetAuthUser() actor: AuthenticatedUser,
    @Param('id', ParseUuidPipe) id: string,
  ) {
    return this.paymentsService.getById(actor, id);
  }
}
