import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import { zonedYmd } from '../../check-ins/utils/tenant-day.util';
import { roundMoney, PublicPayment } from '../mappers/payment.mapper';

const requireFont = createRequire(__filename);
const ARABIC = /[\u0600-\u06FF]/;

export type ReceiptGym = {
  name: string;
  timezone: string;
};

export function receiptFilename(
  memberName: string,
  paidAt: Date,
  timeZone: string,
): string {
  const ymd = zonedYmd(paidAt, timeZone);
  const safe = memberName
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `receipt-${safe || 'member'}-${ymd}.pdf`;
}

export function pdfContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function applyPdfDownloadHeaders(
  res: { setHeader(name: string, value: string): void },
  filename: string,
): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', pdfContentDisposition(filename));
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
}

export function buildPaymentReceiptPdf(
  payment: PublicPayment,
  gym: ReceiptGym,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont(
      'Cairo',
      requireFont.resolve(
        '@fontsource/cairo/files/cairo-latin-400-normal.woff',
      ),
    );
    doc.registerFont(
      'CairoArabic',
      requireFont.resolve(
        '@fontsource/cairo/files/cairo-arabic-400-normal.woff',
      ),
    );

    const fontFor = (text: string) =>
      ARABIC.test(text) ? 'CairoArabic' : 'Cairo';
    const money = (value: number) =>
      `${roundMoney(value).toFixed(2)} ${payment.currency}`;
    const paidAt = new Intl.DateTimeFormat('en-GB', {
      timeZone: gym.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(payment.paidAt);

    doc.font(fontFor(gym.name)).fontSize(18).fillColor('#111').text(gym.name, {
      align: 'center',
    });
    doc
      .font(fontFor(payment.branch.name))
      .fontSize(11)
      .fillColor('#555')
      .text(payment.branch.name, { align: 'center' });
    doc.moveDown(0.6);
    doc
      .font('Cairo')
      .fontSize(14)
      .fillColor(payment.status === 'VOIDED' ? '#b42318' : '#111')
      .text(
        payment.status === 'VOIDED' ? 'VOIDED receipt' : 'Payment receipt',
        { align: 'center' },
      );
    doc.moveDown(1);

    const line = (label: string, value: string) => {
      const y = doc.y;
      doc
        .font('Cairo')
        .fontSize(10)
        .fillColor('#666')
        .text(label, 40, y, { width: 120, lineBreak: false });
      doc.font(fontFor(value)).fillColor('#111').text(value, 160, y, {
        width: 220,
      });
    };

    line('Member', payment.member.name);
    line('Phone', payment.member.phone);
    line('Plan', payment.subscription.planName);
    line('Amount', money(payment.amount));
    line('Method', payment.method);
    line('Status', payment.status);
    line('Paid at', paidAt);
    line('Staff', payment.staff.name);
    line('Branch', payment.branch.name);
    if (payment.notes) {
      line('Notes', payment.notes);
    }
    if (payment.voidReason) {
      line('Void reason', payment.voidReason);
    }
    doc.moveDown(0.8);
    line('Plan price', money(payment.price));
    line('Paid total', money(payment.paidTotal));
    line('Still due', money(payment.dueAmount));
    doc.moveDown(1.4);
    doc
      .font('Cairo')
      .fontSize(8)
      .fillColor('#888')
      .text(`Receipt ${payment.id}`, 40);

    doc.end();
  });
}
