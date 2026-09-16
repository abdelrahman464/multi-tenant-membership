import { csvCell, csvContentDisposition, csvFilename, toCsv } from './csv.util';

describe('csv.util', () => {
  it('quotes commas, quotes, and newlines', () => {
    expect(csvCell('Maadi, Cairo')).toBe('"Maadi, Cairo"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('prefixes formula-like values so Excel does not execute them', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('+cmd')).toBe(`"'+cmd"`);
    expect(csvCell('-1+2')).toBe(`"'-1+2"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
  });

  it('writes UTF-8 BOM and CRLF rows', () => {
    const csv = toCsv(['name', 'amount'], [['Ahmed', 200]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('name,amount\r\nAhmed,200\r\n');
  });

  it('builds a download filename and Content-Disposition', () => {
    expect(csvFilename('payments', '2026-09-01', '2026-09-15')).toBe(
      'payments-2026-09-01_2026-09-15.csv',
    );
    expect(csvContentDisposition('members-2026-09-16.csv')).toContain(
      'attachment; filename="members-2026-09-16.csv"',
    );
  });
});
