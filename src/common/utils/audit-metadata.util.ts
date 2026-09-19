/** Read `a.b.c` on a JSON object. Missing / non-primitive values are ignored. */
export function pickBodyMetadata(
  body: unknown,
  paths?: Record<string, string>,
): Record<string, string> | null {
  if (!paths || !body || typeof body !== 'object') {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, path] of Object.entries(paths)) {
    const value = valueAt(body, path);
    if (typeof value === 'string' && value.length > 0) {
      out[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function mergeAuditMetadata(
  staticMeta?: Record<string, string>,
  fromBody?: Record<string, string> | null,
): Record<string, string> | null {
  if (!staticMeta && !fromBody) {
    return null;
  }
  return { ...(staticMeta ?? {}), ...(fromBody ?? {}) };
}

function valueAt(body: object, path: string): unknown {
  let current: unknown = body;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
