# ServisLoop — Engineering Plan

> Field-service maintenance platform. Devices in the field get serviced on a schedule,
> customers scan a QR code to book or report a fault, technicians run checklists, and the
> system produces a signed PDF service report and computes the next service date.

**Status:** in active development. Progress is tracked in [`TASKS.md`](./TASKS.md).

---

## 1. Repository assessment

The build started from an **empty directory**. Findings from the pre-flight inspection:

| Check | Result |
|---|---|
| Existing repository | None. `git status` → *not a git repository*. |
| Existing ServisLoop source | None. Filesystem-wide `find -iname '*servisloop*'` returned nothing. |
| Uploaded specification files | None. `/mnt/user-data/uploads` does not exist. |
| Runtime | Node **v22.22.2**, npm **10.9.7** |
| Disk | 30 GB available |
| npm registry | Reachable |
| Unicode fonts for PDF | `DejaVuSans.ttf` present at `/usr/share/fonts/truetype/dejavu/` — vendored into the repo so PDF output renders `č ć ž š đ` correctly with no network dependency |

**Consequence:** this is a greenfield build. The functional scope below is derived from the
20-point specification supplied in the task brief.

---

## 2. Architecture

### 2.1 Guiding principle — deterministic core

The brief requires the product to work with **no AI service available**, and that
reminders, booking availability, permissions, dates, service intervals and reports be
deterministic. The architecture enforces this structurally:

```
   ┌──────────────────────────────────────────────────────────┐
   │  src/domain/**   —  PURE TypeScript. No I/O, no network,  │
   │                     no Date.now(), no randomness.         │
   │                     Every function takes an explicit      │
   │                     `now: Date` and returns a value.      │
   │                     100% unit-tested with Vitest.         │
   └──────────────────────────────────────────────────────────┘
                                ▲
                                │  called by
   ┌──────────────────────────────────────────────────────────┐
   │  src/server/**   —  Data access, server actions, route    │
   │                     handlers, PDF/QR generation.          │
   └──────────────────────────────────────────────────────────┘
                                ▲
   ┌──────────────────────────────────────────────────────────┐
   │  src/app/**      —  Next.js App Router. RSC by default.   │
   │  src/components  —  UI. shadcn/ui-style Radix + CVA.      │
   └──────────────────────────────────────────────────────────┘
```

No AI call sits on any critical path. The domain layer has zero runtime dependencies
beyond `date-fns`, so it is portable and trivially testable.

### 2.2 Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15.5 (App Router)** + React 19 | Server Components, server actions, route handlers in one deployable |
| Language | **TypeScript**, `strict: true` | `noUncheckedIndexedAccess` on |
| Styling | **Tailwind CSS v4** | CSS-first config, no `tailwind.config.js` needed |
| Components | **shadcn/ui pattern** — Radix primitives + CVA, hand-vendored into `src/components/ui` | No CLI/network dependency at build time; full source control |
| Animation | **Framer Motion 12** | Marketing site motion, list transitions |
| 3D | **React Three Fiber 9 + drei 10 + three 0.185** | Interactive lifecycle hero |
| Database / Auth | **Supabase** (Postgres + Auth + RLS) | Row-level security is the multi-tenancy boundary |
| Data access | **Repository interface with two adapters** | see §2.3 |
| Validation | **Zod 4** | One schema shared by client form, server action and API route |
| Forms | react-hook-form + `@hookform/resolvers` | |
| PDF | **pdf-lib** + vendored DejaVuSans | Pure JS, deterministic byte output, no headless browser |
| QR | **qrcode** | Server-side SVG/PNG |
| Import | **papaparse** (CSV) + **exceljs** (XLSX) | Both maintained, pure JS |
| Tests | **Vitest 4** | Unit tests for domain, integration tests for adapters and import |
| Lint | ESLint 9 flat config + `eslint-config-next` | |

### 2.3 Data access — why two adapters

`src/server/data/repository.ts` defines a `Repository` interface. Two implementations:

1. **`SupabaseRepository`** — production. Used whenever `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. All tenant isolation is enforced by Postgres RLS.
2. **`JsonRepository`** — a deterministic file-backed store at `.data/store.json`, seeded
   from the demo organization fixture. Used when Supabase env vars are absent.

This is not a mock. It is a working local driver so that `npm run dev` produces a fully
browsable application on a clean checkout with **zero external services**, and so the test
suite can exercise real repository code paths without a database. The selection happens in
one place — `src/server/data/index.ts` — and nothing above the repository layer knows which
adapter is live.

### 2.4 Multi-tenancy and public surfaces

Every tenant row carries `org_id`. RLS policies allow access only where the caller has a
`memberships` row for that org. Three surfaces are **public and unauthenticated**:

- `/d/[token]` — the QR device page
- booking submission
- issue reporting

These never query Postgres as `anon`. They go through server route handlers that use the
service-role key and are scoped by an unguessable per-device `public_token`
(32 bytes, base64url). RLS therefore stays fully closed to `anon` on every table.

---

## 3. Folder structure

```
servisloop/
├── PLAN.md
├── TASKS.md
├── README.md
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
├── assets/fonts/DejaVuSans.ttf            vendored, for PDF Unicode
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_extensions.sql
│   │   ├── 0002_core_tables.sql
│   │   ├── 0003_operations_tables.sql
│   │   ├── 0004_indexes.sql
│   │   ├── 0005_rls_helpers.sql
│   │   ├── 0006_rls_policies.sql
│   │   └── 0007_triggers.sql
│   └── seed.sql
└── src/
    ├── app/
    │   ├── (marketing)/                   public marketing site
    │   │   ├── page.tsx                   home + 3D hero
    │   │   ├── features/ pricing/ contact/
    │   ├── (auth)/                        sign-in, sign-up, callback
    │   ├── (app)/app/                     authenticated product
    │   │   ├── layout.tsx                 org guard + shell
    │   │   ├── page.tsx                   dashboard
    │   │   ├── customers/ locations/ devices/
    │   │   ├── work-orders/ bookings/ issues/
    │   │   ├── reminders/ reports/ settings/
    │   ├── d/[token]/                     PUBLIC device page (QR target)
    │   └── api/
    │       ├── devices/[id]/qr/           QR SVG/PNG
    │       ├── work-orders/[id]/report/   PDF stream
    │       ├── public/booking/  public/issue/
    │       └── cron/reminders/            reminder dispatch endpoint
    ├── components/
    │   ├── ui/                            shadcn-style primitives
    │   ├── marketing/                     hero, three/, sections
    │   └── app/                           tables, forms, shells
    ├── domain/                            ★ PURE — the deterministic core
    │   ├── dates.ts
    │   ├── service-interval.ts
    │   ├── reminders.ts
    │   ├── availability.ts
    │   ├── permissions.ts
    │   ├── checklist.ts
    │   ├── work-order.ts
    │   ├── reports.ts
    │   ├── import-mapping.ts
    │   └── __tests__/
    ├── server/
    │   ├── data/                          repository + adapters
    │   ├── actions/                       server actions
    │   ├── auth/                          session, org context, guards
    │   ├── pdf/                           service report renderer
    │   ├── qr/
    │   └── import/                        CSV + XLSX parsing
    └── lib/                               types, utils, env, constants
```

---

## 4. Database model

15 tables. Every tenant table carries `org_id uuid not null`.

```
organizations ─┬─< memberships >─ profiles ─ auth.users
               ├─< customers ──< locations ──< devices >── device_types
               │                                 │
               │                                 ├─< bookings
               │                                 ├─< issues
               │                                 ├─< reminders
               │                                 └─< work_orders ──< work_order_checklist_results
               │                                        └──< service_reports
               ├─< checklist_templates ──< checklist_items
               ├─< business_hours
               ├─< blackout_dates
               └─< audit_log
```

### Key columns

**`devices`** is the heart of the system:

| Column | Type | Note |
|---|---|---|
| `service_interval_days` | `int` | falls back to `device_types.default_interval_days` |
| `last_service_at` | `date` | set on work-order completion |
| `next_service_due` | `date` | **computed deterministically**, never hand-edited |
| `public_token` | `text unique` | 32-byte base64url, the QR target |
| `status` | enum | `active` \| `paused` \| `retired` |

**`reminders`** carries `unique (device_id, due_date, stage)`. That constraint is the
idempotency guarantee: the dispatch job can run any number of times per day and will never
double-send. Stages are `T_30`, `T_7`, `T_0`, `OVERDUE`.

**`work_orders`** has `kind ∈ {scheduled, issue, booking}` so every order traces back to
what created it, and `status ∈ {draft, scheduled, in_progress, completed, cancelled}`.

Checklist results snapshot the item's `label` and `kind` at completion time, so editing a
template later never rewrites the history of a signed report.

### Roles

| Role | Customers/Devices | Work orders | Members | Org settings |
|---|---|---|---|---|
| `owner` | full | full | full | full incl. delete |
| `admin` | full | full | invite/remove non-owners | full except delete |
| `technician` | read | read all, update **assigned**, complete, report | — | — |
| `viewer` | read | read | — | — |

Encoded once in `src/domain/permissions.ts` as a pure function
`can(role, action, ctx) → boolean`, unit-tested, and mirrored in SQL RLS policies.

---

## 5. Implementation phases

| # | Phase | Output |
|---|---|---|
| 0 | Assessment & planning | `PLAN.md`, `TASKS.md` |
| 1 | Scaffold & toolchain | Next 15 + TS strict + Tailwind 4 + ESLint + Vitest, green `typecheck` |
| 2 | **Deterministic domain core** | `src/domain/**` + full unit test suite. No I/O. |
| 3 | Data layer | Repository interface, `JsonRepository`, `SupabaseRepository`, demo seed |
| 4 | Supabase migrations & RLS | 7 migrations, helper functions, policies for all 15 tables |
| 5 | Design system & app shell | UI primitives, nav, org switcher |
| 6 | Auth, orgs, RBAC | Sign-up/in, org creation, invites, guards |
| 7 | Marketing site + 3D hero | R3F lifecycle scene, sections, motion |
| 8 | Customers / locations / devices | CRUD + CSV/XLSX import with dry-run preview |
| 9 | QR device pages | Token pages, QR SVG/PNG endpoint, print sheet |
| 10 | Reminders | Generation, dispatch endpoint, idempotency, log UI |
| 11 | Booking | Availability engine + public booking + confirm→work order |
| 12 | Issue reporting | Public form + triage → work order |
| 13 | Work orders & technician flow | Board, assignment, start/complete, checklist run |
| 14 | Checklists | Templates, items, versioned snapshots |
| 15 | PDF service reports | pdf-lib renderer, signature capture, download |
| 16 | Next service date | Auto-recalculation on completion + reminder regeneration |
| 17 | Dashboard & reports | KPIs, compliance, technician throughput, CSV export |
| 18 | Demo organization | Deterministic seed, one-command reset |
| 19 | Tests | Domain unit + repository/import/PDF integration |
| 20 | Verification | `lint`, `typecheck`, `test`, `build` all green |

---

## 6. Technical risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **No live Supabase instance in this environment** — migrations cannot be applied against a real Postgres here | Cannot prove RLS at runtime | `JsonRepository` keeps the app fully runnable; migrations are written as plain idempotent SQL and validated for syntax; RLS logic is duplicated as a pure, tested function so the intent is verifiable without a DB |
| R2 | **Build-time prerender of authenticated routes** would crash without credentials | `next build` fails | Every route under `(app)` and `/api` is `export const dynamic = 'force-dynamic'`; no Supabase client is constructed at module scope |
| R3 | **R3F + SSR** — `three` touches `window` | Hydration crash | 3D hero loaded via `next/dynamic` with `ssr: false` and a static poster fallback; wrapped in an error boundary so a WebGL failure degrades to the poster |
| R4 | **Three.js bundle size** (~600 KB) on the marketing page | Slow first paint | Dynamic import, only the specific `three` modules used, `prefers-reduced-motion` short-circuits to the static poster |
| R5 | **Timezone drift** in service dates | Wrong due dates near midnight / DST | All scheduling arithmetic uses date-only `YYYY-MM-DD` civil dates in `src/domain/dates.ts`; no UTC↔local conversion in interval maths |
| R6 | **Duplicate reminder sends** if the cron endpoint retries | Customer spam | DB unique constraint `(device_id, due_date, stage)` + transactional `pending → sent` transition |
| R7 | **Double-booked slots** under concurrent public submissions | Two customers, one slot | Availability computed deterministically from confirmed work orders; final confirmation re-checks under a unique partial index on `(device_id, scheduled_for)` |
| R8 | **PDF Unicode** — standard PDF fonts lack `č ć ž š đ` | Corrupted reports | DejaVuSans vendored and embedded via `@pdf-lib/fontkit`; no network fetch |
| R9 | **Messy import files** — merged headers, junk rows, locale dates/decimals | Bad data written | Import is two-phase: parse → validate → **dry-run preview with per-row errors**, and nothing is written until the user confirms |
| R10 | **Template edits rewriting signed history** | Compliance failure | Checklist results snapshot label/kind; templates are versioned and never mutated in place |
| R11 | Tailwind v4 + shadcn CLI mismatch | Broken styling | UI primitives hand-vendored, no CLI dependency |
| R12 | Scope is large for one pass | Half-finished features | Strict phase order, `TASKS.md` updated continuously, verification gate (phase 20) before any completion claim |

---

## 7. Definition of done

- `npm run lint` — 0 errors
- `npm run typecheck` — 0 errors
- `npm run test` — all green
- `npm run build` — production build succeeds
- `npm run dev` on a clean checkout with **no `.env`** → browsable app with demo org
- No AI/network call on any critical path
