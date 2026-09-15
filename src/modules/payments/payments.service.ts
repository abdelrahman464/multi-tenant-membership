import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaymentsRepository } from './repository/payments.repository';

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepository: PaymentsRepository) {}

  list(actor: AuthenticatedUser, query: ListPaymentsQueryDto) {
    return this.paymentsRepository.findMany(actor.tenantId, query);
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const payment = await this.paymentsRepository.findById(actor.tenantId, id);
    if (!payment) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.PAYMENT_NOT_FOUND,
        'Payment not found',
      );
    }
    return payment;
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
}
