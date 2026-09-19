# membership-api

Staff-only B2B API for gyms and academies. One Postgres database, many tenants (businesses), branches as locations. Isolation is `tenant_id` plus **row-level security (RLS)**.

**Phase 28 (current):** guest / day pass. A walk-in is a 1-day, 1-visit sold plan that ends at the next gym midnight. One desk action can find-or-create the person, collect, and check in. No second door.

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
| GET | `/api/v1/branches` | Owner, admin (`search`, `status`, `sort`, `page`, `limit`) |
| POST | `/api/v1/branches` | Owner, admin (`name`, optional `hours`, `hoursExceptions`) |
| GET | `/api/v1/branches/:id` | Owner, admin |
| PATCH | `/api/v1/branches/:id` | Owner, admin (`name`, `status`, `hours`, `hoursExceptions`) |
| GET | `/api/v1/staff` | Owner, admin (`search`, `role`, `branchId`, `status`, `sort`, `page`, `limit`) |
| POST | `/api/v1/staff` | Owner (admin or branch staff); admin (branch staff only) |
| GET | `/api/v1/staff/:id` | Owner, admin |
| PATCH | `/api/v1/staff/:id` | Owner, admin (`name`, `email`, `password`, `role`, `branchId`, `status`) |
| GET | `/api/v1/members` | Any staff (`search`, `code`, `status`, `homeBranchId`, `neverVisited`, `inactiveDays`, `sort`, `page`, `limit`) |
| POST | `/api/v1/members` | Any staff |
| GET | `/api/v1/members/:id` | Any staff |
| PATCH | `/api/v1/members/:id` | Any staff |
| GET | `/api/v1/plans` | Any staff (`search`, `status`, `kind`, `allBranches`, `branchId`, `sort`, `page`, `limit`) |
| POST | `/api/v1/plans` | Owner, admin |
| GET | `/api/v1/plans/:id` | Any staff |
| PATCH | `/api/v1/plans/:id` | Owner, admin |
| POST | `/api/v1/dayPasses` | Any staff (walk-in sell; optional collect + check-in) |
| GET | `/api/v1/subscriptions` | Any staff (`memberId`, `planId`, `soldByStaffId`, `cancelledByStaffId`, `status`, `kind`, `unpaid`, `inProgress`, `completedUnrenewed`, `expired`, `endingSoon`, `sort`, `page`, `limit`) |
| POST | `/api/v1/subscriptions` | Any staff (`memberId` + `planId`) |
| GET | `/api/v1/subscriptions/:id` | Any staff |
| POST | `/api/v1/subscriptions/:id/freeze` | Any staff (`{ days }`) |
| POST | `/api/v1/subscriptions/:id/unfreeze` | Any staff |
| POST | `/api/v1/subscriptions/:id/renew` | Any staff |
| POST | `/api/v1/subscriptions/:id/cancel` | Owner, admin (`reason`) |
| GET | `/api/v1/settings` | Any staff |
| PATCH | `/api/v1/settings` | Owner, admin |
| GET | `/api/v1/notifications` | Any staff (`type`, `subscriptionId`, `unread`, `search`, `sort`, `page`, `limit`) |
| GET | `/api/v1/notifications/unreadCount` | Any staff |
| GET | `/api/v1/notifications/:id` | Any staff |
| POST | `/api/v1/notifications/:id/read` | Any staff |
| POST | `/api/v1/notifications/readAll` | Any staff |
| GET | `/api/v1/checkIns` | Any staff (`memberId`, `branchId`, `subscriptionId`, `sort`, `page`, `limit`) |
| POST | `/api/v1/checkIns` | Any staff (`memberId` or `memberCode` + `branchId`, optional `subscriptionId`) |
| GET | `/api/v1/payments` | Any staff (`memberId`, `subscriptionId`, `planId`, `branchId`, `method`, `status`, `sort`, `page`, `limit`) |
| POST | `/api/v1/payments` | Any staff (`subscriptionId` + `branchId` + `method`, optional `amount` / `notes`) |
| POST | `/api/v1/payments/:id/void` | Owner, admin (`reason`) |
| GET | `/api/v1/payments/:id` | Any staff |
| GET | `/api/v1/payments/:id/receipt` | Any staff (PDF) |
| GET | `/api/v1/dashboard` | Any staff (`from`, `to` as `YYYY-MM-DD`; gym counts + collections in that range) |
| GET | `/api/v1/reports/members` | Any staff (CSV; `search`, `status`, `homeBranchId`, `neverVisited`, `inactiveDays`) |
| GET | `/api/v1/reports/payments` | Any staff (CSV; `from`, `to`, `memberId`, `subscriptionId`, `planId`, `branchId`, `method`, `status`) |
| GET | `/api/v1/reports/checkIns` | Any staff (CSV; `from`, `to`, `memberId`, `branchId`, `subscriptionId`) |
| GET | `/api/v1/reports/subscriptions` | Any staff (CSV; `memberId`, `planId`, `soldByStaffId`, `cancelledByStaffId`, `status`, `kind`, `unpaid`, `inProgress`, `completedUnrenewed`, `expired`, `endingSoon`) |
| GET | `/api/v1/audit` | Owner, admin (`action`, `staffId`, `entityType`, `entityId`, `from`, `to`, `sort`, `page`, `limit`) |

`BRANCH_STAFF` must be assigned a `branchId` in this tenant. Admins are not assigned to one branch. Nobody can create a second `TENANT_OWNER` through the API. Owner/admin add and rename locations with `POST`/`PATCH /branches` (same unique name rule as the platform route). `hours` is `null` (always open, the default) or all seven weekdays (`sunday`…`saturday`). Each day is `{ open, close }` as `HH:MM` (`close` may be `24:00`) or `null` (closed that day). Times are the gym timezone. Overnight is allowed (`22:00`–`06:00`). Close is exclusive. `PATCH` `hours: null` returns a location to 24/7. `hoursExceptions` is `null` / `[]` (none) or unique `YYYY-MM-DD` rows: `{ date, hours: null }` closes that gym calendar day, or `{ date, hours: { open, close } }` replaces the weekly window for that day only (max 366). A date exception wins over 24/7 and over the weekday. Overnight from the previous day does not spill into a closed exception. List/get/create/update and `/auth/me` tenant branches include `hours` and `hoursExceptions`. `status: ARCHIVED` keeps history (check-ins, payments, home branch) but new check-ins, payments, desk assignments, member home branch, and selected-plan `branchIds` fail with `BRANCH_ARCHIVED`. The last active location is `BRANCH_LAST_ACTIVE`. Active `BRANCH_STAFF` still assigned there is `BRANCH_HAS_STAFF` — reassign them first. List/get/create/update include `status` (`ACTIVE` default). `/auth/me` tenant branches include `status` too. The owner row cannot be patched (`STAFF_OWNER_LOCKED`). Owner can edit admins and desk staff; admin can edit desk staff only. Promoting desk staff to admin needs `branchId: null`. Demoting an admin needs a `branchId`. `status: ARCHIVED` keeps the row (check-ins and sold plans still name them) but login, refresh, and the access token fail with `STAFF_ARCHIVED`. Changing email, password, role, branch, or status bumps `sessionVersion` so old JWTs die. Optional `password` on PATCH is a desk reset told in person — not email forgot-password. List/get/create/update include `status` (`ACTIVE` default).

Member `phone` must be E.164 (`+201001234567`). The same number may exist in two gyms. `homeBranchId` must be a branch of the staff’s tenant. Member list/get/create/update include nested `homeBranch` (`id`, `name`), `code` (8 characters, no 0/O/1/I), and `lastCheckedInAt` (`null` until the first successful visit). `neverVisited=true` is people who have never checked in. `inactiveDays=14` is those people plus anyone whose last visit is older than 14 rolling days. Sort `lastCheckedInAt` or `-lastCheckedInAt`. A refused door visit does not change this field. The API generates `code`; staff cannot pick or edit it. Same code in two gyms is allowed. `GET /members?code=` is an exact match; `search=` also looks at `code`. A QR on a badge should encode this code, not the UUID. Create is always `ACTIVE`. `PATCH status: BLOCKED` refuses the door and a new sale/renew (`MEMBER_BLOCKED`) but keeps the row, visits, sold plans, and remaining due — desk `unpaid` / dashboard `due` still include them. Payments still collect. `GET /members?status=BLOCKED`. `ARCHIVED` still hides them from unpaid/due and refuses pay. `PATCH status: ACTIVE` restores the door. Staff list/create/get/update, login, and `/auth/me` include nested `branch` (`id`, `name`) or `null` for owner/admin, plus `status`. `GET /auth/me` also returns the gym `tenant` (settings and branches). `tenant_id` is never accepted from the body.

A plan always has `durationDays`. `sessionCount` is optional (8 sessions in 30 days). `maxVisitsPerDay` is 1 or 2 in typical gyms (default 1): how many times the member may check in on one calendar day. `kind` is `MEMBERSHIP` (default) or `DAY_PASS`. A day pass is forced to 1 day and 1 visit (`PLAN_DAY_PASS_TERMS` if the body sends other terms). `allBranches: true` (default) means every location; `false` requires `branchIds` in this tenant. `GET /plans?branchId=` returns all-location plans plus selected plans that include that branch. `GET /plans?kind=DAY_PASS` is the walk-in shelf. Member home branch is not the plan’s allowed branches. Price is major units of the tenant currency (EGP), not a Stripe amount. Desk staff can list plans and subscribe members but cannot create or edit plans.

Subscribing snapshots the sold terms (`kind`, `durationDays`, `sessionCount`, `sessionsRemaining`, `maxVisitsPerDay`, `price`, `planName`). A member may hold more than one subscription. Archived members, blocked members, and archived plans cannot be sold. List, get, create, freeze, unfreeze, renew, and cancel return nested `member` (name, phone, status), `staff` who sold it (`id`, name, role — `null` on rows sold before that phase), `cancelledBy` (`id`, name, role — `null` until cancelled), current `plan` (name, status), `branches`, plus `paidTotal` and `dueAmount`. That seller is not edited later; renew is a **new** row with the staff who renewed. Desk lists: `unpaid=true` (zero or partial payment), `inProgress=true` (still running: live status and pack sessions left), `completedUnrenewed=true` (expired or pack used up, and they have not bought that plan again — day passes are excluded), `expired=true` (status `EXPIRED`, including rows that were later renewed), `endingSoon=true` (`ACTIVE` membership and `endsAt` within 7 rolling days — same as dashboard; day passes are excluded so they do not spam the inbox). Frozen, cancelled, and already-expired rows are not ending soon. Combine with `memberId` / `planId` / `soldByStaffId` / `cancelledByStaffId` / `kind`.

`POST /dayPasses` is the walk-in. Body: `planId` (must be `DAY_PASS`), `branchId`, and either `memberId` or `name` + `phone` (find-or-create by phone; blocked/archived still refuse). Optional `method` / `amount` / `notes` collect in the same transaction. `checkIn` defaults true (branch must be open). `checkIn: false` sells only — they can walk in later today on `POST /checkIns`. Response: `memberCreated`, `member`, `subscription`, `payment`, `checkIn`. A day pass `endsAt` is the next gym midnight, not +24 hours. No grace. Freeze is `DAY_PASS_NO_FREEZE`. Same-day second visit is another sale, not renew. After hours with `checkIn` true is `BRANCH_CLOSED` and nothing is written. Payments still ignore hours when `checkIn` is false.

`POST /subscriptions/:id/cancel` is owner/admin only. It does **not** delete the row. Status becomes `CANCELLED` (`cancelledAt`, `cancelReason`, `cancelledBy`). Check-in and further collections stop. Collected payments stay; remaining due drops off `unpaid`, `inProgress`, and dashboard `due` (those queries already ignore cancelled). An open freeze is closed so the nightly settle cannot turn the row back to `ACTIVE`. Cancel twice is `SUBSCRIPTION_ALREADY_CANCELLED`. Expired rows stay expired (`SUBSCRIPTION_NOT_ACTIVE`). Branch staff get `403`. Gym B gets `404`. There is no un-cancel; sell a new plan instead.

`POST /checkIns` decrements a pack and counts visits on the tenant calendar day (Cairo). Send `memberId` or `memberCode` (or both if they match). Missing both is `MEMBER_LOOKUP_REQUIRED`. A code from another gym is `404`. Create and list return `memberId`, `subscriptionId`, nested `member` (name, phone, status), `branch` (name), `staff` (name, role — no password), and `subscription` with sold terms and current `plan` name. Branch staff may only check in at their assigned branch. After hours, or on a closed date exception, is `BRANCH_CLOSED` (payments still collect). A blocked member is `MEMBER_BLOCKED` (no inbox row, no visit). Unpaid check-in is allowed unless `requirePaymentForAccess` is on. Then the member must have paid at least `minPaidPercentForAccess` of the sold price (default 50). A free plan (`price` 0) always passes the door.

### How the door picks a plan (when staff do not choose one)

At check-in the desk sends **who** (`memberId`) and **where** (`branchId`). They may also send **which sold plan** (`subscriptionId`). If they omit that, the system picks one for this member at this location. Home branch is not used.

**A sold plan can be used only if all of these are true:**

- It belongs to this member at this gym.
- The member is not `ARCHIVED` or `BLOCKED`.
- It is allowed at this location (every branch, or this branch is on the plan).
- It is not frozen and not cancelled.
- If it is a session pack, it still has sessions left.
- If it is still in its paid dates (`ACTIVE`), those dates have not ended.
- If the paid dates have ended, it is still inside the gym’s extra grace days, and this sold plan has not already used up that grace.
- If the gym turned on “must pay before entry”, this sold plan has collected at least the gym’s percent of the price (default half). A free plan (price 0) is never blocked for money.

If nothing matches, check-in is refused. If the only problem is money, the error is `CHECKIN_PAYMENT_REQUIRED`. A selected-location plan at the wrong branch is `CHECKIN_BRANCH_NOT_ALLOWED`: no visit is written, the inbox gets one `CHECKIN_BRANCH_BLOCKED` row for that sold plan (`skipDuplicates` — repeat attempts do not stack), and audit records `CHECK_IN_BLOCKED` on every attempt. Auto-pick only writes those rows when nothing else lets the member in. Frozen / cancelled / expired denials do not use this inbox type.

**If more than one sold plan still matches, the door uses this order:**

1. A plan that is still in its paid dates (`ACTIVE`).
2. Otherwise a plan already in grace (`IN_GRACE`).
3. Otherwise a plan that has ended but has unused grace left (this visit will start grace).
4. If two are in the same group, the one that **ends sooner** (so the visit is used on the plan that is about to run out).

Example: Ahmed has Gold until the end of the month and a PT pack that ends next week. Both are allowed at this branch and both are still active. The desk does not pick a plan. The door uses the **PT pack**, because it ends sooner.

A live plan always beats a grace plan. So if Ahmed also has an old expired month with unused grace, the door still uses Gold or PT first, not the old grace plan.

**Daily visit limit** is counted on the plan that was chosen. If that plan already had its visits for today, the door says “daily limit” even if another plan still has visits. In that case the desk should send `subscriptionId` for the other plan.

**When to send `subscriptionId`:** the member has two products (gym + PT, two packs, old plan in grace plus a new one) and the receptionist must put the visit on a specific one. If they always have one live plan, omitting `subscriptionId` is fine.

`POST /payments` is the desk write: cash or card, amount in major units of the gym currency (EGP). Omit `amount` to take the remaining due (`price` minus payments so far). Partials are allowed. Overpay is `PAYMENT_EXCEEDS_DUE`. Fully paid is `PAYMENT_ALREADY_SETTLED`. A free plan (`price` 0) is `PAYMENT_NOT_DUE`. Cancelled subscriptions and archived members cannot be charged. `memberId` and `currency` come from the subscription, not the body. List, get, and create return the receipt plus nested `member` (name, phone, status), `branch` (name), `staff` (name, role — no password), and `subscription` with sold terms and current `plan` name. `status` is `COLLECTED` until voided. `GET /payments/:id/receipt` is the same row as a PDF (gym, member, plan, amount, remaining due). In Postman use **Send and Download**. Gym B cannot print gym A’s payment (`404`). Unpaid does not block check-in unless the gym turns on `requirePaymentForAccess`. Branch staff may only record a payment at their assigned branch.

`POST /payments/:id/void` is owner/admin only. It does **not** delete the row. The receipt stays (`VOIDED`, `voidedAt`, `voidReason`); paid total and due ignore it, so the desk can collect again. Void twice is `PAYMENT_ALREADY_VOIDED`. Branch staff get `403`. Gym B gets `404`. Dashboard collections and door payment-percent count only `COLLECTED` rows. There is no card-network refund (this is not Stripe).

`GET /dashboard` is the morning screen. Optional `from` and `to` (`YYYY-MM-DD`, gym calendar, inclusive, max 366 days) filter **activity**: check-ins, collections, and members who joined in that window. Omit both to use today. Members on the books (`active`, `archived`, `blocked`), live/frozen/grace/expired sold plans, ending-soon (7 days), `completedUnrenewed` (same rule as `GET /subscriptions?completedUnrenewed=true`), and remaining **due** are always *now*, not historical. Check-ins include unique members and a per-branch split. Collections split cash vs card. Fully paid and free plans (`price` 0) are not in `due`. Blocked members still count in `due`. Gym B never sees gym A’s numbers.

`GET /reports/members`, `/reports/payments`, `/reports/checkIns`, and `/reports/subscriptions` return UTF-8 CSV (`text/csv`, `Content-Disposition: attachment`). Columns use **names** (member, plan, branch, staff / soldBy), not UUIDs; phone distinguishes two people with the same name. Members also lists the desk `code`, `lastCheckedInAt`, and sold `plans` (names). Member CSV filters match the list API (`search`, `status`, `homeBranchId`, `neverVisited`, `inactiveDays`). In Postman use **Send and Download** (the arrow next to Send), not Send — Send only shows the text in the body tab. Members and subscriptions are a snapshot of the gym now. Payments and check-ins use the same gym-calendar `from`/`to` as the dashboard (omit both for today, max 366 days, max 10 000 rows). Subscription filters match the list API (`memberId`, `planId`, `soldByStaffId`, `cancelledByStaffId`, `status`, `kind`, `unpaid`, `inProgress`, `completedUnrenewed`, `expired`, `endingSoon`). Payment filters match the list API (`memberId`, `subscriptionId`, `planId`, `branchId`, `method`). Check-in filters match the list API (`memberId`, `branchId`, `subscriptionId`). Formula-like cells are prefixed so Excel will not execute them. Gym B never downloads gym A’s rows. One payment as PDF is `GET /payments/:id/receipt`, not a reports CSV.

Rate limits are per client IP in Redis (skipped in tests). Defaults: login 20/min, refresh 60/min, reports 30/min, platform 60/min, other API 180/min. Over the cap is `429 RATE_LIMITED` with `Retry-After`. If Redis is down, the limiter fails open so the desk is not locked; login still needs Redis for sessions. `/health` is not limited.

`GET /audit` is the owner/admin trail of **writes** (login, password change, members, plans, staff create/update, branches, subscriptions, check-ins, blocked check-ins, payments, payment void, subscription cancel, day pass sold, settings, CSV export, payment PDF). No GET lists, no passwords or tokens. Optional gym-calendar `from`/`to` (max 366 days). Gym B never sees gym A’s rows. Branch staff cannot read the log. The audit interceptor only records successful HTTP writes; a refused door visit writes `CHECK_IN_BLOCKED` inside the check-in transaction before the `400`. `DAY_PASS_SOLD` metadata is ids only (`memberId`, optional `paymentId` / `checkInId`, `memberCreated`). CSV exports use `metadata.resource`. Other writes stay `metadata: null` — open the `entityId`.

Freeze and grace are one policy for time plans and packs (`GET`/`PATCH /settings`). `freezeEnabled` is the master switch. `maxFreezeDays` is per freeze; `maxFreezeDaysPerYear` is a rolling year. Freezing pushes `endsAt` by `days`; unfreezing early gives unused days back. A scheduled freeze that reaches `freezeEndsAt` is settled back to `ACTIVE` on the next read. Renew is allowed only after `endsAt` (the paid period has ended, including during grace). It creates a **new** subscription for the same member and plan with a fresh session pack. Leftover sessions stay on the old row. `accessUntil` is `endsAt` plus `graceDays` when grace is on. At `endsAt` the row becomes `EXPIRED` (`expiredAt` set). `inGrace` is true while status is `IN_GRACE`, or while `EXPIRED` with unused grace and `now <= accessUntil`. The first successful check-in in that window sets status to `IN_GRACE`, sets `graceUsedAt` and `graceEndsAt` (the window frozen at that moment), and writes `SUBSCRIPTION_IN_GRACE`. After `graceEndsAt`, check-in is blocked and `IN_GRACE` settles back to `EXPIRED`. `graceUsedAt` stays set, so this sold plan cannot open a second grace window (even if staff later raise `graceDays`). Renew is a new row, so it can have its own grace. Frozen rows are not expired. Opening the inbox (or any subscription read, or the one-minute sweep) writes at most one `SUBSCRIPTION_ENDING_SOON` row while the plan is still `ACTIVE` and `endsAt` is within 7 rolling days (`Ahmed Hassan's Gold 30 ends soon`), then at most one `SUBSCRIPTION_EXPIRED` row at `endsAt`. A later freeze that pushes `endsAt` does not delete the ending-soon row. A wrong-branch door attempt writes at most one `CHECKIN_BRANCH_BLOCKED` row for that sold plan (`Ahmed Hassan's Maadi only is not allowed at Nasr City`). `readAt` is shared by the gym. Email and member notifications are not in this phase. Cancel is owner/admin and is not reversed by that sweep.

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

- **Tenant** = the business. **Branch** = a location. Branch name is unique per tenant. Nest keeps them in `TenantsModule` and `BranchesModule`. Creating a gym still writes the first branch in the same transaction.
- Gym-owned rows carry `tenant_id`. RLS + `FORCE` hide other gyms even from the table owner.
- Session: `app.platform=on` (platform routes) or `app.tenant_id=<uuid>` (staff JWT). Set with `SET LOCAL` inside a transaction so pooled connections cannot leak.

One freeze policy on `tenant_settings` covers time plans and session packs. Staff update it via `/settings`. `requirePaymentForAccess` (default off) plus `minPaidPercentForAccess` (default 50) can block the door until that share of the sold price is collected. At `endsAt`, `ACTIVE` becomes `EXPIRED` on the next staff read or on the background sweep. That write inserts a `SUBSCRIPTION_EXPIRED` inbox row. While still `ACTIVE` and within 7 days of `endsAt`, settle inserts `SUBSCRIPTION_ENDING_SOON`. `IN_GRACE` is only set at the door.

---

## Docker / CI

```bash
npm run docker:infra    # postgres + redis
npm run docker:full     # also build/run the API (`--profile app`)
```

The API image runs `prisma migrate deploy` then `node dist/main.js`. Jenkins tags the image with `APP_VERSION` (git sha).

---

## Next

**Forgot password / WhatsApp / SMS:** still need a real mailer or messaging provider.
