import { roundMoney } from '../../payments/mappers/payment.mapper';

export function memberCsvRow(row: {
  name: string;
  phone: string;
  email: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  homeBranch: { name: string };
  subscriptions: { planName: string }[];
}): Array<string | Date | null> {
  const plans = [
    ...new Set(row.subscriptions.map((item) => item.planName)),
  ].join('; ');
  return [
    row.name,
    row.phone,
    row.email,
    row.status,
    row.homeBranch.name,
    plans || null,
    row.notes,
    row.createdAt,
  ];
}

export function paymentCsvRow(
  row: {
    paidAt: Date;
    method: string;
    status: string;
    amount: { toString(): string } | number;
    currency: string;
    notes: string | null;
    member: { name: string; phone: string };
    branch: { name: string };
    staff: { name: string };
    subscription: {
      planName: string;
      price: { toString(): string } | number;
    };
  },
  paidTotal: number,
): Array<string | number | Date | null> {
  const price = roundMoney(Number(row.subscription.price));
  const paid = roundMoney(paidTotal);
  return [
    row.paidAt,
    row.method,
    row.status,
    roundMoney(Number(row.amount)),
    row.currency,
    row.notes,
    row.member.name,
    row.member.phone,
    row.subscription.planName,
    row.branch.name,
    row.staff.name,
    price,
    paid,
    roundMoney(Math.max(0, price - paid)),
  ];
}

export function checkInCsvRow(row: {
  checkedInAt: Date;
  member: { name: string; phone: string };
  branch: { name: string };
  staff: { name: string };
  subscription: { planName: string; status: string };
}): Array<string | Date> {
  return [
    row.checkedInAt,
    row.member.name,
    row.member.phone,
    row.subscription.planName,
    row.subscription.status,
    row.branch.name,
    row.staff.name,
  ];
}

export function subscriptionCsvRow(
  row: {
    status: string;
    planName: string;
    durationDays: number;
    sessionCount: number | null;
    sessionsRemaining: number | null;
    maxVisitsPerDay: number;
    price: { toString(): string } | number;
    startsAt: Date;
    endsAt: Date;
    expiredAt: Date | null;
    createdAt: Date;
    member: { name: string; phone: string; status: string };
    tenant: { currency: string };
  },
  paidTotal: number,
): Array<string | number | Date | null> {
  const price = roundMoney(Number(row.price));
  const paid = roundMoney(paidTotal);
  return [
    row.member.name,
    row.member.phone,
    row.member.status,
    row.planName,
    row.status,
    row.durationDays,
    row.sessionCount,
    row.sessionsRemaining,
    row.maxVisitsPerDay,
    price,
    paid,
    roundMoney(Math.max(0, price - paid)),
    row.tenant.currency,
    row.startsAt,
    row.endsAt,
    row.expiredAt,
    row.createdAt,
  ];
}
