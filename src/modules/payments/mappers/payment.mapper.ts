import { Prisma } from '@prisma/client';
import { PAYMENT_INCLUDE } from '../constants/payment.constants';

export type PaymentWithRelations = Prisma.PaymentGetPayload<{
  include: typeof PAYMENT_INCLUDE;
}>;

export type PublicPayment = {
  id: string;
  method: PaymentWithRelations['method'];
  status: PaymentWithRelations['status'];
  amount: number;
  currency: string;
  notes: string | null;
  voidReason: string | null;
  paidAt: Date;
  voidedAt: Date | null;
  price: number;
  paidTotal: number;
  dueAmount: number;
  member: PaymentWithRelations['member'];
  branch: PaymentWithRelations['branch'];
  staff: PaymentWithRelations['staff'];
  subscription: {
    id: string;
    status: PaymentWithRelations['subscription']['status'];
    planName: string;
    durationDays: number;
    sessionCount: number | null;
    sessionsRemaining: number | null;
    startsAt: Date;
    endsAt: Date;
    plan: PaymentWithRelations['subscription']['plan'];
  };
};

export function toPublicPayment(
  row: PaymentWithRelations,
  extras: { paidTotal: number },
): PublicPayment {
  const price = Number(row.subscription.price);
  return {
    id: row.id,
    method: row.method,
    status: row.status,
    amount: Number(row.amount),
    currency: row.currency,
    notes: row.notes,
    voidReason: row.voidReason,
    paidAt: row.paidAt,
    voidedAt: row.voidedAt,
    price,
    paidTotal: extras.paidTotal,
    dueAmount: roundMoney(Math.max(0, price - extras.paidTotal)),
    member: row.member,
    branch: row.branch,
    staff: row.staff,
    subscription: {
      id: row.subscription.id,
      status: row.subscription.status,
      planName: row.subscription.planName,
      durationDays: row.subscription.durationDays,
      sessionCount: row.subscription.sessionCount,
      sessionsRemaining: row.subscription.sessionsRemaining,
      startsAt: row.subscription.startsAt,
      endsAt: row.subscription.endsAt,
      plan: row.subscription.plan,
    },
  };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
