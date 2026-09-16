import { StaffRole } from '../../staff/enums/staff-role.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PublicPayment } from '../mappers/payment.mapper';
import {
  buildPaymentReceiptPdf,
  pdfContentDisposition,
  receiptFilename,
} from './receipt-pdf.util';

const payment: PublicPayment = {
  id: '11111111-1111-4111-8111-111111111111',
  method: PaymentMethod.CASH,
  status: PaymentStatus.COLLECTED,
  amount: 400,
  currency: 'EGP',
  notes: 'Partial, desk',
  voidReason: null,
  paidAt: new Date('2026-09-16T14:30:00.000Z'),
  voidedAt: null,
  price: 1000,
  paidTotal: 400,
  dueAmount: 600,
  member: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Ahmed Hassan',
    phone: '+201006660001',
    status: 'ACTIVE',
  },
  branch: { id: '33333333-3333-4333-8333-333333333333', name: 'Maadi' },
  staff: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Owner A',
    role: StaffRole.TENANT_OWNER,
  },
  subscription: {
    id: '55555555-5555-4555-8555-555555555555',
    status: 'ACTIVE',
    planName: 'Gold 30',
    durationDays: 30,
    sessionCount: 8,
    sessionsRemaining: 7,
    startsAt: new Date('2026-09-16T00:00:00.000Z'),
    endsAt: new Date('2026-10-16T00:00:00.000Z'),
    plan: {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Gold 30',
      status: 'ACTIVE',
    },
  },
};

describe('receipt-pdf.util', () => {
  it('names the file from the member and gym calendar day', () => {
    expect(
      receiptFilename('Ahmed Hassan', payment.paidAt, 'Africa/Cairo'),
    ).toBe('receipt-Ahmed-Hassan-2026-09-16.pdf');
  });

  it('sets Content-Disposition for a PDF download', () => {
    expect(
      pdfContentDisposition('receipt-Ahmed-Hassan-2026-09-16.pdf'),
    ).toContain('attachment; filename="receipt-Ahmed-Hassan-2026-09-16.pdf"');
  });

  it('builds a PDF with the gym, member, and plan glyphs', async () => {
    const pdf = await buildPaymentReceiptPdf(payment, {
      name: 'Pay Gym A',
      timezone: 'Africa/Cairo',
    });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Cairo-Regular');
    const glyphs = unicodeGlyphs(text);
    for (const char of 'Ahmed HassanGold 30Pay Gym A') {
      expect(glyphs).toContain(char);
    }
    expect(text).not.toContain(payment.member.id);
  });
});

function unicodeGlyphs(pdf: string): string {
  return [...pdf.matchAll(/<([0-9A-Fa-f]{4})>/g)]
    .map((match) => String.fromCharCode(Number.parseInt(match[1], 16)))
    .join('');
}
