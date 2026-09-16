import { roundMoney } from '../../payments/mappers/payment.mapper';

export function memberCsvRow(row: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  homeBranchId: string;
  notes: string | null;
  createdAt: Date;
  homeBranch: { id: string; name: string };
}): Array<string | Date | null> {
  return [
    row.id,
    row.name,
    row.phone,
    row.email,
    row.status,
    row.homeBranchId,
    row.homeBranch.name,
    row.notes,
    row.createdAt,
  ];
}

export function paymentCsvRow(
  row: {
    id: string;
    paidAt: Date;
    method: string;
    amount: { toString(): string } | number;
    currency: string;
    notes: string | null;
    member: { id: string; name: string; phone: string };
    branch: { id: string; name: string };
    staff: { id: string; name: string };
    subscription: {
      id: string;
      planName: string;
      price: { toString(): string } | number;
    };
  },
  paidTotal: number,
): Array<string | number | Date | null> {
  const price = roundMoney(Number(row.subscription.price));
  const paid = roundMoney(paidTotal);
  return [
    row.id,
    row.paidAt,
    row.method,
    roundMoney(Number(row.amount)),
    row.currency,
    row.notes,
    row.member.id,
    row.member.name,
    row.member.phone,
    row.branch.id,
    row.branch.name,
    row.staff.id,
    row.staff.name,
    row.subscription.id,
    row.subscription.planName,
    price,
    paid,
    roundMoney(Math.max(0, price - paid)),
  ];
}

export function checkInCsvRow(row: {
  id: string;
  checkedInAt: Date;
  member: { id: string; name: string; phone: string };
  branch: { id: string; name: string };
  staff: { id: string; name: string };
  subscription: { id: string; planName: string; status: string };
}): Array<string | Date> {
  return [
    row.id,
    row.checkedInAt,
    row.member.id,
    row.member.name,
    row.member.phone,
    row.branch.id,
    row.branch.name,
    row.staff.id,
    row.staff.name,
    row.subscription.id,
    row.subscription.planName,
    row.subscription.status,
  ];
}
