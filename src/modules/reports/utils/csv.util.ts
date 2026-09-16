const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(
  value: string | number | boolean | Date | null | undefined,
): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return csvCell(value.toISOString());
  let text = typeof value === 'string' ? value : String(value);
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text) || text.startsWith("'")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  headers: readonly string[],
  rows: Array<Array<string | number | boolean | Date | null | undefined>>,
): string {
  const lines = [
    headers.map((header) => csvCell(header)).join(','),
    ...rows.map((row) => row.map((cell) => csvCell(cell)).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
