# Yaara Clinic Management — Backend (NestJS + Prisma)

This replaces the old Express + Supabase-client backend with a proper NestJS + Prisma
service matching the frontend spec: JWT auth, role-guarded REST endpoints, a real
WebSocket events gateway, a live ETA engine, and richer analytics.

## Stack

- **NestJS** (modular controllers/services/guards)
- **Prisma** ORM → Postgres (Supabase Postgres or any Postgres works — wire up `DATABASE_URL` later)
- **Socket.io** via `@nestjs/websockets` for real-time queue/ETA/bill events
- **JWT** auth via `@nestjs/passport` + `passport-jwt`, token stored in an HTTP-only cookie
  (falls back to `Authorization: Bearer` for non-browser clients)

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npx prisma generate
npx prisma migrate dev --name init
npm run seed            # demo users + patients, same accounts as the old backend
npm run start:dev
```

Demo accounts (password `password123` for all):
- `doctor@clinic.com` — Dr. Sarah Johnson (General Physician)
- `doctor2@clinic.com` — Dr. Alan Reyes (Pediatrics)
- `receptionist@clinic.com` — Emily Chen

## Module layout

```
src/
  auth/          POST /api/auth/login, /logout, GET /api/auth/verify
  patients/      Patient directory (search + pagination), CRUD, history lookup
  queue/         Live queue: check-in, status/priority changes, drag-drop reorder
  eta/           Live ETA engine — priority-weighted, learns each doctor's avg
                 consultation time over time
  bills/         Invoice generation + filterable billing history
  analytics/     Per-doctor and clinic-wide metrics (avg consult time, daily
                 volume, weekly trend)
  events/        EventsGateway — the real-time hub every other module publishes to
  common/        Guards (JwtAuthGuard, RolesGuard), decorators (@Roles, @Public,
                 @CurrentUser), global exception filter
```

## Role-based access

Every route requires a valid JWT by default (global `JwtAuthGuard`); mark a route
`@Public()` to skip that. On top of auth, `@Roles(Role.doctor)` /
`@Roles(Role.receptionist)` restrict by role via `RolesGuard`.

**Doctors only ever see their own queue/patients/analytics** — routes like
`GET /api/queue/me`, `GET /api/eta/me`, `GET /api/analytics/me` derive the doctor
id from the JWT rather than taking it as a param, so there's no way to pass
someone else's `doctorId` and see their board. Receptionist routes (`GET /api/queue`,
`GET /api/eta/doctor/:doctorId`, `GET /api/analytics/clinic`) can see across doctors.

## WebSocket events

Clients connect with their JWT in `socket.handshake.auth.token` and are placed into
rooms (`role:receptionist`, `doctor:<id>`) so broadcasts only reach relevant
dashboards. Events emitted: `queue:updated`, `queue:patient-called`, `eta:updated`,
`bill:updated`.

## What's different from the old Express/Supabase-client backend

- Proper NestJS module/controller/service structure instead of one 475-line
  `server.js` file.
- Prisma schema/migrations instead of hand-written SQL + the Supabase JS client.
- Added: dedicated `/eta` endpoints and engine (previously nonexistent), a real
  `events.gateway.ts` (previously two bare `socket.io` listeners with no rooms/auth),
  role-scoped doctor visibility, and multi-metric analytics (previously a single
  flat `/analytics` endpoint).
- Auth token now goes in an HTTP-only cookie by default, matching the frontend spec,
  while still returning the token in the body for non-cookie clients.

## Still to do (flagged, not done here)

- Wire `DATABASE_URL` to your Supabase Postgres instance and run migrations against it.
- Decide on refresh-token / token-expiry UX (currently a flat 8h JWT).
- Add rate limiting (`@nestjs/throttler`) before production exposure.
