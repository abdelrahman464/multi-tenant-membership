# membership-api

Staff-only B2B API for gyms and academies. One Postgres database, many tenants (businesses), branches as locations. Isolation is `tenant_id` plus **row-level security (RLS)**.

**Phase 14 (current):** subscriptions CSV. Staff can download sold plans with the same desk filters as the list API.

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

Use the returned `accessToken` as `Authorization: Bearer …`. Refresh uses the `refreshToken` httpOnly cookie, or `{ "refreshToken": "…" }` in the body. `GET /auth/me` returns the staff row plus the gym `tenant` (name, slug, country, timezone, currency, status, settings, branches).

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
| GET | `/api/v1/staff` | Owner, admin (`search`, `role`, `branchId`, `sort`, `page`, `limit`) |
| POST | `/api/v1/staff` | Owner (admin or branch staff); admin (branch staff only) |
| GET | `/api/v1/members` | Any staff (`search`, `status`, `homeBranchId`, `sort`, `page`, `limit`) |
| POST | `/api/v1/members` | Any staff |
| GET | `/api/v1/members/:id` | Any staff |
| PATCH | `/api/v1/members/:id` | Any staff |
| GET | `/api/v1/plans` | Any staff (`search`, `status`, `allBranches`, `branchId`, `sort`, `page`, `limit`) |
| POST | `/api/v1/plans` | Owner, admin |
| GET | `/api/v1/plans/:id` | Any staff |
| PATCH | `/api/v1/plans/:id` | Owner, admin |
| GET | `/api/v1/subscriptions` | Any staff (`memberId`, `planId`, `status`, `unpaid`, `inProgress`, `completedUnrenewed`, `expired`, `sort`, `page`, `limit`) |
| POST | `/api/v1/subscriptions` | Any staff (`memberId` + `planId`) |
| GET | `/api/v1/subscriptions/:id` | Any staff |
| POST | `/api/v1/subscriptions/:id/freeze` | Any staff (`{ days }`) |
| POST | `/api/v1/subscriptions/:id/unfreeze` | Any staff |
| POST | `/api/v1/subscriptions/:id/renew` | Any staff |
| GET | `/api/v1/settings` | Any staff |
| PATCH | `/api/v1/settings` | Owner, admin |
| GET | `/api/v1/notifications` | Any staff (`type`, `subscriptionId`, `unread`, `search`, `sort`, `page`, `limit`) |
| GET | `/api/v1/notifications/unreadCount` | Any staff |
| GET | `/api/v1/notifications/:id` | Any staff |
| POST | `/api/v1/notifications/:id/read` | Any staff |
| POST | `/api/v1/notifications/readAll` | Any staff |
| GET | `/api/v1/checkIns` | Any staff (`memberId`, `branchId`, `subscriptionId`, `sort`, `page`, `limit`) |
| POST | `/api/v1/checkIns` | Any staff (`memberId` + `branchId`, optional `subscriptionId`) |
| GET | `/api/v1/payments` | Any staff (`memberId`, `subscriptionId`, `planId`, `branchId`, `method`, `sort`, `page`, `limit`) |
| POST | `/api/v1/payments` | Any staff (`subscriptionId` + `branchId` + `method`, optional `amount` / `notes`) |
| GET | `/api/v1/payments/:id` | Any staff |
| GET | `/api/v1/dashboard` | Any staff (`from`, `to` as `YYYY-MM-DD`; gym counts + collections in that range) |
| GET | `/api/v1/reports/members` | Any staff (CSV; `search`, `status`, `homeBranchId`) |
| GET | `/api/v1/reports/payments` | Any staff (CSV; `from`, `to`, `memberId`, `subscriptionId`, `planId`, `branchId`, `method`) |
| GET | `/api/v1/reports/checkIns` | Any staff (CSV; `from`, `to`, `memberId`, `branchId`, `subscriptionId`) |
| GET | `/api/v1/reports/subscriptions` | Any staff (CSV; `memberId`, `planId`, `status`, `unpaid`, `inProgress`, `completedUnrenewed`, `expired`) |
| GET | `/api/v1/audit` | Owner, admin (`action`, `staffId`, `entityType`, `entityId`, `from`, `to`, `sort`, `page`, `limit`) |

`BRANCH_STAFF` must be assigned a `branchId` in this tenant. Admins are not assigned to one branch. Nobody can create a second `TENANT_OWNER` through the API.

Member `phone` must be E.164 (`+201001234567`). The same number may exist in two gyms. `homeBranchId` must be a branch of the staff’s tenant. Member list/get/create/update include nested `homeBranch` (`id`, `name`). Staff list/create, login, and `/auth/me` include nested `branch` (`id`, `name`) or `null` for owner/admin. `GET /auth/me` also returns the gym `tenant` (settings and branches). `tenant_id` is never accepted from the body.

A plan always has `durationDays`. `sessionCount` is optional (8 sessions in 30 days). `maxVisitsPerDay` is 1 or 2 in typical gyms (default 1): how many times the member may check in on one calendar day. `allBranches: true` (default) means every location; `false` requires `branchIds` in this tenant. `GET /plans?branchId=` returns all-location plans plus selected plans that include that branch. Member home branch is not the plan’s allowed branches. Price is major units of the tenant currency (EGP), not a Stripe amount. Desk staff can list plans and subscribe members but cannot create or edit plans.

Subscribing snapshots the sold terms (`durationDays`, `sessionCount`, `sessionsRemaining`, `maxVisitsPerDay`, `price`, `planName`). A member may hold more than one subscription. Archived members and archived plans cannot be sold. List, get, create, freeze, unfreeze, and renew return nested `member` (name, phone, status), current `plan` (name, status), `branches`, plus `paidTotal` and `dueAmount`. Desk lists: `unpaid=true` (zero or partial payment), `inProgress=true` (still running: live status and pack sessions left), `completedUnrenewed=true` (expired or pack used up, and they have not bought that plan again), `expired=true` (status `EXPIRED`, including rows that were later renewed). Combine with `memberId` / `planId`. Who sold the row is not stored.

`POST /checkIns` decrements a pack and counts visits on the tenant calendar day (Cairo). Create and list return `memberId`, `subscriptionId`, nested `member` (name, phone, status), `branch` (name), `staff` (name, role — no password), and `subscription` with sold terms and current `plan` name. Branch staff may only check in at their assigned branch. Unpaid check-in is allowed unless `requirePaymentForAccess` is on. Then the member must have paid at least `minPaidPercentForAccess` of the sold price (default 50). A free plan (`price` 0) always passes the door.

### How the door picks a plan (when staff do not choose one)

At check-in the desk sends **who** (`memberId`) and **where** (`branchId`). They may also send **which sold plan** (`subscriptionId`). If they omit that, the system picks one for this member at this location. Home branch is not used.

**A sold plan can be used only if all of these are true:**

- It belongs to this member at this gym.
- It is allowed at this location (every branch, or this branch is on the plan).
- It is not frozen and not cancelled.
- If it is a session pack, it still has sessions left.
- If it is still in its paid dates (`ACTIVE`), those dates have not ended.
- If the paid dates have ended, it is still inside the gym’s extra grace days, and this sold plan has not already used up that grace.
- If the gym turned on “must pay before entry”, this sold plan has collected at least the gym’s percent of the price (default half). A free plan (price 0) is never blocked for money.

If nothing matches, check-in is refused. If the only problem is money, the error is `CHECKIN_PAYMENT_REQUIRED`.

**If more than one sold plan still matches, the door uses this order:**

1. A plan that is still in its paid dates (`ACTIVE`).
2. Otherwise a plan already in grace (`IN_GRACE`).
3. Otherwise a plan that has ended but has unused grace left (this visit will start grace).
4. If two are in the same group, the one that **ends sooner** (so the visit is used on the plan that is about to run out).

Example: Ahmed has Gold until the end of the month and a PT pack that ends next week. Both are allowed at this branch and both are still active. The desk does not pick a plan. The door uses the **PT pack**, because it ends sooner.

A live plan always beats a grace plan. So if Ahmed also has an old expired month with unused grace, the door still uses Gold or PT first, not the old grace plan.

**Daily visit limit** is counted on the plan that was chosen. If that plan already had its visits for today, the door says “daily limit” even if another plan still has visits. In that case the desk should send `subscriptionId` for the other plan.

**When to send `subscriptionId`:** the member has two products (gym + PT, two packs, old plan in grace plus a new one) and the receptionist must put the visit on a specific one. If they always have one live plan, omitting `subscriptionId` is fine.

`POST /payments` is the desk write: cash or card, amount in major units of the gym currency (EGP). Omit `amount` to take the remaining due (`price` minus payments so far). Partials are allowed. Overpay is `PAYMENT_EXCEEDS_DUE`. Fully paid is `PAYMENT_ALREADY_SETTLED`. A free plan (`price` 0) is `PAYMENT_NOT_DUE`. Cancelled subscriptions and archived members cannot be charged. `memberId` and `currency` come from the subscription, not the body. List, get, and create return the receipt plus nested `member` (name, phone, status), `branch` (name), `staff` (name, role — no password), and `subscription` with sold terms and current `plan` name. Unpaid does not block check-in unless the gym turns on `requirePaymentForAccess`. Branch staff may only record a payment at their assigned branch. No void or refund in this phase.

`GET /dashboard` is the morning screen. Optional `from` and `to` (`YYYY-MM-DD`, gym calendar, inclusive, max 366 days) filter **activity**: check-ins, collections, and members who joined in that window. Omit both to use today. Members on the books, live/frozen/grace/expired sold plans, ending-soon (7 days), `completedUnrenewed` (same rule as `GET /subscriptions?completedUnrenewed=true`), and remaining **due** are always *now*, not historical. Check-ins include unique members and a per-branch split. Collections split cash vs card. Fully paid and free plans (`price` 0) are not in `due`. Gym B never sees gym A’s numbers.

`GET /reports/members`, `/reports/payments`, `/reports/checkIns`, and `/reports/subscriptions` return UTF-8 CSV (`text/csv`, `Content-Disposition: attachment`). Columns use **names** (member, plan, branch, staff), not UUIDs; phone distinguishes two people with the same name. Members also lists sold `plans` (names). In Postman use **Send and Download** (the arrow next to Send), not Send — Send only shows the text in the body tab. Members and subscriptions are a snapshot of the gym now. Payments and check-ins use the same gym-calendar `from`/`to` as the dashboard (omit both for today, max 366 days, max 10 000 rows). Subscription filters match the list API (`memberId`, `planId`, `status`, `unpaid`, `inProgress`, `completedUnrenewed`, `expired`). Payment filters match the list API (`memberId`, `subscriptionId`, `planId`, `branchId`, `method`). Check-in filters match the list API (`memberId`, `branchId`, `subscriptionId`). Formula-like cells are prefixed so Excel will not execute them. Gym B never downloads gym A’s rows. No PDF in this phase.

Rate limits are per client IP in Redis (skipped in tests). Defaults: login 20/min, refresh 60/min, reports 30/min, platform 60/min, other API 180/min. Over the cap is `429 RATE_LIMITED` with `Retry-After`. If Redis is down, the limiter fails open so the desk is not locked; login still needs Redis for sessions. `/health` is not limited.

`GET /audit` is the owner/admin trail of **writes** (login, password change, members, plans, staff, subscriptions, check-ins, payments, settings, CSV export). No GET lists, no passwords or tokens. Optional gym-calendar `from`/`to` (max 366 days). Gym B never sees gym A’s rows. Branch staff cannot read the log.

Freeze and grace are one policy for time plans and packs (`GET`/`PATCH /settings`). `freezeEnabled` is the master switch. `maxFreezeDays` is per freeze; `maxFreezeDaysPerYear` is a rolling year. Freezing pushes `endsAt` by `days`; unfreezing early gives unused days back. A scheduled freeze that reaches `freezeEndsAt` is settled back to `ACTIVE` on the next read. Renew is allowed only after `endsAt` (the paid period has ended, including during grace). It creates a **new** subscription for the same member and plan with a fresh session pack. Leftover sessions stay on the old row. `accessUntil` is `endsAt` plus `graceDays` when grace is on. At `endsAt` the row becomes `EXPIRED` (`expiredAt` set). `inGrace` is true while status is `IN_GRACE`, or while `EXPIRED` with unused grace and `now <= accessUntil`. The first successful check-in in that window sets status to `IN_GRACE`, sets `graceUsedAt` and `graceEndsAt` (the window frozen at that moment), and writes `SUBSCRIPTION_IN_GRACE`. After `graceEndsAt`, check-in is blocked and `IN_GRACE` settles back to `EXPIRED`. `graceUsedAt` stays set, so this sold plan cannot open a second grace window (even if staff later raise `graceDays`). Renew is a new row, so it can have its own grace. Frozen rows are not expired. Opening the inbox (or any subscription read, or the one-minute sweep) writes at most one `SUBSCRIPTION_EXPIRED` row at `endsAt`. `readAt` is shared by the gym. Email and member notifications are not in this phase.

---

## Environment

| Variable | Who uses it | Role |
|---|---|---|
| `PLATFORM_API_KEY` | Nest (`app.platformApiKey`) | Platform operator secret |
| `DATABASE_URL` | Nest (Prisma adapter) | App role `membership_app` — **not** a superuser (RLS must apply) |
| `MIGRATE_DATABASE_URL` | Prisma CLI (`prisma.config.ts`) | Owner `multitenant` — `CREATE` / `ALTER` / `DROP` |
| `REDIS_URL` | Nest | Refresh sessions and rate-limit counters |
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

One freeze policy on `tenant_settings` covers time plans and session packs. Staff update it via `/settings`. `requirePaymentForAccess` (default off) plus `minPaidPercentForAccess` (default 50) can block the door until that share of the sold price is collected. At `endsAt`, `ACTIVE` becomes `EXPIRED` on the next staff read or on the background sweep. That write inserts a `SUBSCRIPTION_EXPIRED` inbox row. `IN_GRACE` is only set at the door.

---

## Docker / CI

```bash
npm run docker:infra    # postgres + redis
npm run docker:full     # also build/run the API (`--profile app`)
```

The API image runs `prisma migrate deploy` then `node dist/main.js`. Jenkins tags the image with `APP_VERSION` (git sha).

---

## Next

**Forgot password / WhatsApp / SMS:** still need a real mailer or messaging provider. PDF receipts and payment void/refund are not in this phase.
