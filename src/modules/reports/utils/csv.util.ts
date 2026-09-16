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

export function csvFilename(kind: string, from: string, to: string): string {
  return from === to ? `${kind}-${from}.csv` : `${kind}-${from}_${to}.csv`;
}

export function csvContentDisposition(filename: string): string {
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function applyCsvDownloadHeaders(
  res: { setHeader(name: string, value: string): void },
  filename: string,
): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', csvContentDisposition(filename));
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
}
