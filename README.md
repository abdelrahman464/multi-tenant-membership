# membership-api

Staff-only B2B API for gyms and academies. One Postgres database, many tenants (businesses), branches as locations. Isolation is `tenant_id` plus **row-level security (RLS)**.

**Phase 1 (current):** the platform operator creates and manages tenants. There is no staff JWT yet.

| | |
|---|---|
| Runtime | Node.js 22+, NestJS 11 |
| Data | PostgreSQL 16, Prisma 7 |
| Cache / later sessions | Redis 7 |

---


## Requirements

- Node.js >= 22.12
- Docker (Postgres + Redis)
- A long random `PLATFORM_API_KEY` (treat it as root for the SaaS)

---

## Run locally

```bash
cp .env.example .env
# set PLATFORM_API_KEY, then:
npm ci
docker compose up -d postgres redis
npx prisma migrate deploy
npm run start:dev
```

Prisma CLI reads `.env` (not `.env.development`). Nest with `NODE_ENV=development` loads `.env.development` then `.env`.

| Check | URL |
|---|---|
| Liveness | `GET http://localhost:8000/api/v1/health` |
| Ready (Postgres) | `GET http://localhost:8000/api/v1/health/ready` |

Create a gym (PowerShell; use the same key as `.env`):

```powershell
curl.exe -X POST http://localhost:8000/api/v1/platform/tenants `
  -H "Content-Type: application/json" `
  -H "x-platform-key: YOUR_PLATFORM_API_KEY" `
  -d "{\"name\":\"Delta Swim\",\"slug\":\"delta-swim\",\"firstBranch\":{\"name\":\"Maadi\"}}"
```

`slug` is optional; if omitted it is generated from `name` (`delta-swim`, then `-1`, `-2`).

```bash
npm run lint
npm test
npm run build
```

---

## Platform APIs

All routes below require header **`x-platform-key`**. Gym staff must never receive this value.

| Method | Path | What |
|---|---|---|
| POST | `/api/v1/platform/tenants` | Create tenant, default settings, first branch |
| GET | `/api/v1/platform/tenants` | Paginated list (`search`, `status`, `sort`, `page`, `limit`) |
| GET | `/api/v1/platform/tenants/:id` | Get one |
| PATCH | `/api/v1/platform/tenants/:id` | Update `name` and/or `slug` |
| DELETE | `/api/v1/platform/tenants/:id` | Hard delete (cascades settings and branches) |
| POST | `/api/v1/platform/tenants/:id/suspend` | Suspend |
| POST | `/api/v1/platform/tenants/:id/reactivate` | Reactivate |
| POST | `/api/v1/platform/tenants/:id/branches` | Add a branch |

Country defaults to Egypt: timezone `Africa/Cairo`, currency `EGP`. Clients cannot send those fields.

List example:

```http
GET /api/v1/platform/tenants?search=delta&status=ACTIVE&sort=-createdAt&page=1&limit=10
```

Response shape: `{ data, total, page, limit, totalPages }`.

---

## Environment

| Variable | Who uses it | Role |
|---|---|---|
| `PLATFORM_API_KEY` | Nest (`app.platformApiKey`) | Platform operator secret |
| `DATABASE_URL` | Nest (Prisma adapter) | App role `membership_app` — **not** a superuser (RLS must apply) |
| `MIGRATE_DATABASE_URL` | Prisma CLI (`prisma.config.ts`) | Owner `multitenant` — `CREATE` / `ALTER` / `DROP` |
| `REDIS_URL` | Reserved for Phase 2 refresh tokens | Redis |
| `APP_VERSION` | `/health`, Docker tag | Build id (default `0.1.0`) |

Default database name: **`multitenant_membership`**.

Schema change:

```bash
npx prisma migrate dev --name short_name   # local: create SQL + apply
npx prisma migrate deploy                  # CI / Docker: apply existing folders
npx prisma generate                        # TypeScript client only — does not change tables
```

---

## Tenancy

- **Tenant** = the business. **Branch** = a location. Branch name is unique per tenant.
- Gym-owned rows carry `tenant_id`. RLS + `FORCE` hide other gyms even from the table owner.
- Session: `app.platform=on` (platform routes) or `app.tenant_id=<uuid>` (staff later). Set with `SET LOCAL` inside a transaction so pooled connections cannot leak.

Freeze/grace columns on `tenant_settings` are stored only. One freeze policy covers time plans and session packs. Not enforced until a later phase.

---

## Docker / CI

```bash
npm run docker:infra    # postgres + redis
npm run docker:full     # also build/run the API (`--profile app`)
```

The API image runs `prisma migrate deploy` then `node dist/main.js`. Jenkins tags the image with `APP_VERSION` (git sha).

---

## Next

**Phase 2 — Staff auth:** JWT access, Redis refresh, roles (`TENANT_OWNER`, `ADMIN`, `BRANCH_STAFF`), first owner at tenant create. `tenant_id` comes from the token, never from the client body.
