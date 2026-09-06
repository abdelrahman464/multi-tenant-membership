import { PaginatedResponseDto } from '../dto/paginated-response.dto';

const META = new Set(['page', 'limit', 'sort', 'search']);
const RANGE_OPS = new Set(['gte', 'gt', 'lte', 'lt']);

export type PrismaWhere = Record<string, unknown>;
export type PrismaOrderBy = Record<string, 'asc' | 'desc'>;

export type PrismaListArgs = {
  where: PrismaWhere;
  orderBy: PrismaOrderBy[];
  skip: number;
  take: number;
};

/**
 * Query-string → Prisma findMany args.
 * Same chain as nest-ecommerc ApiFeatures, without Mongoose.
 *
 * GET /resource?search=delta&status=ACTIVE&sort=-createdAt&page=1&limit=10
 */
export class ApiFeatures {
  page = 1;
  limit = 10;

  private readonly where: PrismaWhere = {};
  private orderBy: PrismaOrderBy[] = [{ createdAt: 'desc' }];

  constructor(private readonly query: Record<string, unknown>) {}

  filter(allowed: readonly string[]): this {
    for (const field of allowed) {
      if (META.has(field)) continue;
      const value = this.query[field];
      if (value === undefined || value === '') continue;

      if (isPlainObject(value)) {
        const ops: Record<string, unknown> = {};
        for (const [op, raw] of Object.entries(value)) {
          if (RANGE_OPS.has(op) && raw !== undefined && raw !== '') {
            ops[op] = coerce(raw);
          }
        }
        if (Object.keys(ops).length > 0) {
          this.where[field] = ops;
        }
        continue;
      }

      this.where[field] = coerce(value);
    }
    return this;
  }

  search(fields: readonly string[]): this {
    const raw = this.query.search;
    if (typeof raw !== 'string' || !raw.trim() || fields.length === 0) {
      return this;
    }

    const q = raw.trim();
    this.where.OR = fields.map((field) => ({
      [field]: { contains: q, mode: 'insensitive' },
    }));
    return this;
  }

  sort(allowed: readonly string[], fallback = 'createdAt'): this {
    const raw =
      typeof this.query.sort === 'string' && this.query.sort.trim()
        ? this.query.sort
        : `-${fallback}`;

    const allowedSet = new Set(allowed);
    const parsed: PrismaOrderBy[] = [];

    for (const token of raw.split(',')) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      const desc = trimmed.startsWith('-');
      const field = desc ? trimmed.slice(1) : trimmed;
      if (!allowedSet.has(field)) continue;
      parsed.push({ [field]: desc ? 'desc' : 'asc' });
    }

    this.orderBy = parsed.length > 0 ? parsed : [{ [fallback]: 'desc' }];
    return this;
  }

  paginate(maxLimit = 100, defaultLimit = 10): this {
    this.page = positiveInt(this.query.page, 1);
    this.limit = Math.min(
      positiveInt(this.query.limit, defaultLimit),
      maxLimit,
    );
    return this;
  }

  args(): PrismaListArgs {
    return {
      where: this.where,
      orderBy: this.orderBy,
      skip: (this.page - 1) * this.limit,
      take: this.limit,
    };
  }

  paginateResult<T>(data: T[], total: number): PaginatedResponseDto<T> {
    return {
      data,
      total,
      page: this.page,
      limit: this.limit,
      totalPages: Math.ceil(total / this.limit) || 0,
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerce(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function positiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}
