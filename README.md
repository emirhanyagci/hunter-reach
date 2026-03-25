# HunterReach — Outbound Email Campaign System

A production-ready outbound email campaign management system built for Hunter.io CSV exports.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Backend | NestJS + Prisma |
| Database | PostgreSQL |
| Queue | BullMQ + Redis |
| Email | Resend |
| Auth | JWT |

## Quick Start

### 1. Prerequisites
- Node.js 18+
- Docker & Docker Compose

### 2. Start infrastructure
```bash
docker compose up -d
```

### 3. Configure environment

```bash
# API
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — set RESEND_API_KEY, JWT_SECRET

# Web
cp apps/web/.env.local.example apps/web/.env.local
```

### 4. Setup database

```bash
cd apps/api
npm run db:push      # push schema to DB
npm run db:seed      # seed demo user + categories
```

### 5. Start development

```bash
# From root:
npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:4000
- Swagger: http://localhost:4000/api/docs
- Prisma Studio: `npm run db:studio`

### 6. Default login
- Email: `admin@hunterreach.io`
- Password: `password123`

---

## Project Structure

```
HunterReach/
├── apps/
│   ├── api/          NestJS backend
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── csv/
│   │   │   ├── contacts/
│   │   │   ├── templates/
│   │   │   ├── campaigns/
│   │   │   ├── email/
│   │   │   ├── scheduler/
│   │   │   └── webhooks/
│   │   └── prisma/
│   └── web/          Next.js frontend
│       └── src/
│           ├── app/
│           │   ├── login/
│           │   └── dashboard/
│           │       ├── imports/
│           │       ├── contacts/
│           │       ├── templates/
│           │       ├── campaigns/new/
│           │       ├── scheduled/
│           │       └── history/
│           └── components/
└── packages/
    └── shared/       TypeScript types
```

## Features

- **CSV Import** — Upload Hunter.io CSV exports, auto-parse all columns, validate emails
- **Contact Management** — Filter, segment, search, bulk-select contacts
- **Template Engine** — Handlebars templates with `{{variables}}` and `{{fallback}}` helper
- **Campaign Builder** — 4-step wizard: Recipients → Template → Schedule → Send
- **Scheduling** — BullMQ-powered delayed sends with timezone support
- **Dashboard** — Real-time stats, email activity charts
- **History** — Full audit log of sent emails with delivery event tracking
- **Webhook** — Resend webhook integration for open/click/bounce events

## Environment Variables (API)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` | Redis host (default: localhost) |
| `REDIS_PORT` | Redis port (default: 6379) |
| `JWT_SECRET` | JWT signing secret |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender email address |
| `FRONTEND_URL` | CORS origin for frontend |
