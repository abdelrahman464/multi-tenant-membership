import { HttpStatus, Injectable, StreamableFile } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { PaymentsRepository } from './repository/payments.repository';
import {
  buildPaymentReceiptPdf,
  pdfContentDisposition,
  receiptFilename,
} from './utils/receipt-pdf.util';

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepository: PaymentsRepository) {}

  list(actor: AuthenticatedUser, query: ListPaymentsQueryDto) {
    return this.paymentsRepository.findMany(actor.tenantId, query);
  }

  async getById(actor: AuthenticatedUser, id: string) {
    return this.requirePayment(actor, id);
  }

  async receipt(actor: AuthenticatedUser, id: string) {
    const row = await this.paymentsRepository.findReceiptById(
      actor.tenantId,
      id,
    );
    if (!row) {
      throw this.notFound();
    }
    const filename = receiptFilename(
      row.payment.member.name,
      row.payment.paidAt,
      row.gym.timezone,
    );
    const body = await buildPaymentReceiptPdf(row.payment, row.gym);
    return {
      filename,
      file: new StreamableFile(body, {
        type: 'application/pdf',
        disposition: pdfContentDisposition(filename),
      }),
    };
  }

  create(actor: AuthenticatedUser, dto: CreatePaymentDto) {
    return this.paymentsRepository.create(actor, {
      subscriptionId: dto.subscriptionId,
      branchId: dto.branchId,
      method: dto.method,
      amount: dto.amount,
      notes: dto.notes,
    });
  }

  void(actor: AuthenticatedUser, id: string, dto: VoidPaymentDto) {
    return this.paymentsRepository.void(actor, id, dto.reason);
  }

  private async requirePayment(actor: AuthenticatedUser, id: string) {
    const payment = await this.paymentsRepository.findById(actor.tenantId, id);
    if (!payment) {
      throw this.notFound();
    }
    return payment;
  }

  private notFound() {
    return new AppHttpException(
      HttpStatus.NOT_FOUND,
      ErrorCode.PAYMENT_NOT_FOUND,
      'Payment not found',
    );
  }
}
