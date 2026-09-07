# membership-api

Staff-only B2B API for gyms and academies. One Postgres database, many tenants (businesses), branches as locations. Isolation is `tenant_id` plus **row-level security (RLS)**.

**Phase 2 (current):** platform operators create tenants (with the first owner). Staff log in with JWT access tokens and Redis refresh sessions. `tenant_id` comes from the token, never from the client body.

| | |
|---|---|
| Runtime | Node.js 22+, NestJS 11 |
| Data | PostgreSQL 16, Prisma 7 |
| Sessions | Redis 7 (refresh tokens) |

---

## Requirements

- Node.js >= 22.12
- Docker (Postgres + Redis)
- A long random `PLATFORM_API_KEY` (treat it as root for the SaaS)
- Distinct `JWT_SECRET` and `JWT_REFRESH_SECRET`

---

## Run locally

```bash
cp .env.example .env
# set PLATFORM_API_KEY, JWT_SECRET, JWT_REFRESH_SECRET, then:
npm ci
docker compose up -d postgres redis
npx prisma migrate deploy
npm run start:dev
```

Prisma CLI reads `.env` (not `.env.development`). Nest with `NODE_ENV=development` loads `.env.development` then `.env`.

| Check | URL |
|---|---|
| Liveness | `GET http://localhost:8000/api/v1/health` |
| Ready (Postgres + Redis) | `GET http://localhost:8000/api/v1/health/ready` |

Create a gym (PowerShell; use the same key as `.env`):

```powershell
curl.exe -X POST http://localhost:8000/api/v1/platform/tenants `
  -H "Content-Type: application/json" `
  -H "x-platform-key: YOUR_PLATFORM_API_KEY" `
  -d "{\"name\":\"Delta Swim\",\"slug\":\"delta-swim\",\"firstBranch\":{\"name\":\"Maadi\"},\"firstOwner\":{\"name\":\"Owner\",\"email\":\"owner@delta.test\",\"password\":\"Password1!\"}}"
```

`slug` is optional; if omitted it is generated from `name` (`delta-swim`, then `-1`, `-2`).

Staff login (email is unique **per tenant**, so `slug` is required):

```powershell
curl.exe -X POST http://localhost:8000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"slug\":\"delta-swim\",\"email\":\"owner@delta.test\",\"password\":\"Password1!\"}"
```

Use the returned `accessToken` as `Authorization: Bearer …`. Refresh uses the `refreshToken` httpOnly cookie, or `{ "refreshToken": "…" }` in the body.

```bash
npm run lint
npm test
npm run build
```

---

## Platform APIs

All routes below require header **`x-platform-key`**. Gym staff must never receive this value. The platform key is not a staff login.

| Method | Path | What |
|---|---|---|
| POST | `/api/v1/platform/tenants` | Create tenant, settings, first branch, first `TENANT_OWNER` |
| GET | `/api/v1/platform/tenants` | Paginated list (`search`, `status`, `sort`, `page`, `limit`) |
| GET | `/api/v1/platform/tenants/:id` | Get one |
| PATCH | `/api/v1/platform/tenants/:id` | Update `name` and/or `slug` |
| DELETE | `/api/v1/platform/tenants/:id` | Hard delete (cascades settings, branches, staff) |
| POST | `/api/v1/platform/tenants/:id/suspend` | Suspend (staff login is blocked) |
| POST | `/api/v1/platform/tenants/:id/reactivate` | Reactivate |
| POST | `/api/v1/platform/tenants/:id/branches` | Add a branch |

Country defaults to Egypt: timezone `Africa/Cairo`, currency `EGP`. Clients cannot send those fields.

---

## Staff auth

Roles: `TENANT_OWNER`, `ADMIN`, `BRANCH_STAFF`. Role is loaded from the database on every request, not trusted from the JWT.

| Method | Path | Who |
|---|---|---|
| POST | `/api/v1/auth/login` | Public (`slug` + email + password) |
| POST | `/api/v1/auth/refresh` | Public (cookie or body) |
| POST | `/api/v1/auth/logout` | Public (clears cookies / Redis sid) |
| GET | `/api/v1/auth/me` | Any staff |
| POST | `/api/v1/auth/logoutAll` | Any staff |
| GET | `/api/v1/auth/sessions` | Any staff |
| DELETE | `/api/v1/auth/sessions/:sid` | Any staff |
| PATCH | `/api/v1/auth/changePassword` | Any staff |
| GET | `/api/v1/branches` | Owner, admin (`search`, `sort`, `page`, `limit`) |
| GET | `/api/v1/staff` | Owner, admin |
| POST | `/api/v1/staff` | Owner (admin or branch staff); admin (branch staff only) |

`BRANCH_STAFF` must be assigned a `branchId` in this tenant. Admins are not assigned to one branch. Nobody can create a second `TENANT_OWNER` through the API.

---

## Environment

| Variable | Who uses it | Role |
|---|---|---|
| `PLATFORM_API_KEY` | Nest (`app.platformApiKey`) | Platform operator secret |
| `DATABASE_URL` | Nest (Prisma adapter) | App role `membership_app` — **not** a superuser (RLS must apply) |
| `MIGRATE_DATABASE_URL` | Prisma CLI (`prisma.config.ts`) | Owner `multitenant` — `CREATE` / `ALTER` / `DROP` |
| `REDIS_URL` | Nest | Refresh sessions |
| `JWT_SECRET` / `JWT_EXPIRE` | Nest | Access token (default 15m) |
| `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRE` | Nest | Refresh token (default 30d) |
| `COOKIE_SECURE` | Nest | Set `true` behind HTTPS |
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
- Session: `app.platform=on` (platform routes) or `app.tenant_id=<uuid>` (staff JWT). Set with `SET LOCAL` inside a transaction so pooled connections cannot leak.

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

**Phase 3 — Members:** tenant-scoped members, phone unique per tenant (E.164), no member login.
