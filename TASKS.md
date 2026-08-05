# ServisLoop — Task Board

Legend: `[x]` done · `[ ]` todo · `[!]` known gap

**Status: all 20 phases complete.** Verification gate green — see §Verification.

---

## Phase 0 — Assessment & planning
- [x] Inspect repository / filesystem for existing ServisLoop code (none — greenfield)
- [x] Verify toolchain (Node 22.22, npm 10.9, registry, DejaVu fonts, disk)
- [x] `PLAN.md` — assessment, architecture, folder structure, data model, phases, risks
- [x] `TASKS.md`

## Phase 1 — Scaffold & toolchain
- [x] `package.json`, scripts, dependencies
- [x] `tsconfig.json` — strict, `noUncheckedIndexedAccess`, `@/*` alias
- [x] Tailwind v4 + PostCSS + `globals.css` design tokens (light/dark via CSS custom properties)
- [x] ESLint 9 flat config, incl. a rule set that **bans `Date.now()`, `new Date()` and `Math.random()` inside `src/domain`**
- [x] Vitest config + `server-only` test alias
- [x] `next.config.ts`, `.env.example`, `.gitignore`
- [x] Vendored `DejaVuSans.ttf` + `DejaVuSans-Bold.ttf` for PDF Unicode

## Phase 2 — Deterministic domain core (pure, no I/O)
- [x] `dates.ts` — civil-date arithmetic, no timezone/DST drift
- [x] `service-interval.ts` — next due date, `completion` vs `schedule` anchors, overdue state
- [x] `reminders.ts` — 4-stage ladder, idempotency keys, reconciliation, message rendering
- [x] `availability.ts` — slots from business hours, blackouts, lead time, capacity, horizon
- [x] `permissions.ts` — `can(role, action, ctx)` matrix
- [x] `checklist.ts` — validation, tolerance bands, pass/fail scoring
- [x] `work-order.ts` — status machine, transition requirements, code formatting
- [x] `reports.ts` — KPIs, compliance, technician throughput, RFC-4180 CSV
- [x] `import-mapping.ts` — header detection, locale-aware coercion, row validation
- [x] Unit tests for every module

## Phase 3 — Data layer
- [x] Entity types (`src/domain/types.ts`)
- [x] `Repository` interface
- [x] `JsonRepository` — file-backed, mutex-serialised, atomic temp+rename writes
- [x] `SupabaseRepository`
- [x] Adapter selection (`src/server/data/index.ts`) + demo seed
- [x] Parity test so the two adapters cannot silently drift

## Phase 4 — Supabase migrations & RLS
- [x] `0001`–`0007`: extensions, core tables, operations tables, indexes, RLS helpers, RLS policies, triggers
- [x] 19 tables · 12 enums · 69 policies · 68 indexes · 42 checks · 23 triggers
- [x] `next_work_order_code()` — race-safe per-org/per-year sequence
- [x] Validated against a real PostgreSQL 16 cluster: migrations apply, replay cleanly, **46 RLS assertions pass**
- [x] `supabase/README.md`

## Phase 5 — Design system & app shell
- [x] 22 shadcn-pattern UI primitives (Radix + CVA), hand-vendored
- [x] App shell: sidebar, mobile nav, org switcher, user menu, demo banner

## Phase 6 — Auth, organizations, RBAC
- [x] Sign-in (password + magic link), sign-up, `/auth/callback`, sign-out
- [x] Session + org context, three-state (`anonymous` / `no_organization` / `ready`)
- [x] **Onboarding** — first-run organisation creation, owner membership, default hours
- [x] Route guards, role gates, member management, invites
- [x] Demo identity switcher (offline mode only) to exercise the permission gates

## Phase 7 — Marketing site + 3D lifecycle hero
- [x] Layout, header, footer; home, features, pricing, contact
- [x] R3F lifecycle scene — 5-node closed loop with travelling pulse, hover labels
- [x] Four-way degradation: SSR → reduced motion → no WebGL → crash, all to a static poster
- [x] `sr-only` ordered list carries the accessible version of the diagram

## Phase 8 — Customers, locations, devices, import
- [x] Customers CRUD + detail
- [x] Locations CRUD + printable QR label sheet
- [x] Devices register with service-state colouring **plus text label** (never colour alone)
- [x] CSV/XLSX upload → dry-run preview (per-row errors, warnings, duplicate serials) → commit
- [x] Import is idempotent: existing serials are skipped, so re-uploading the same export adds nothing

## Phase 9 — QR device pages
- [x] Public `/d/[token]` page, mobile-first, `noindex`
- [x] QR endpoint (SVG + PNG), authenticated and org-scoped
- [x] Verified the public page leaks no customer name, contact, notes or internal ids

## Phase 10 — Automatic service reminders
- [x] Ladder generation and reconciliation on every due-date change
- [x] `POST /api/cron/reminders` — timing-safe bearer auth, fails closed with no secret
- [x] `ReminderTransport` interface + `ConsoleTransport` (swap in Resend/Postmark by implementing one interface)
- [x] Reminder log UI with stale-reminder warnings and retry

## Phase 11 — Customer booking
- [x] Availability engine wired to business hours, blackouts, capacity, lead time
- [x] Public booking form; unavailable slots shown greyed **with the reason**
- [x] Server-side re-validation at submit — the double-booking race guard
- [x] Confirm → work order · decline with reason

## Phase 12 — Issue reporting
- [x] Public fault form with plain-language severities
- [x] Triage queue → convert to work order (severity carries into priority)

## Phase 13 — Work orders & technician workflow
- [x] Filterable board, `compareWorkOrders` ordering
- [x] "My jobs" default view for technicians
- [x] Assignment, start, complete, cancel — only ever the legal transitions

## Phase 14 — Service checklists
- [x] Template + item editor (kind, required, options, tolerance band, expected boolean)
- [x] Checklist run UI with per-item inline errors
- [x] Results snapshot label/kind so template edits never rewrite signed history

## Phase 15 — PDF service reports
- [x] `pdf-lib` renderer with embedded DejaVu — `č ć ž š đ` render correctly
- [x] Multi-page with `Page n of m` footers
- [x] Byte-identical output on regeneration; stable report number
- [x] Signature block

## Phase 16 — Next service date automation
- [x] Recalculated on completion, inside `src/server/service/scheduling.ts` — the only writer
- [x] Reminder ladder rebuilt in the same operation
- [x] **Fixed:** a no-op recalculation used to advance the date a full interval under the `schedule` anchor; now idempotent, with a regression test

## Phase 17 — Dashboard & reports
- [x] KPI tiles, needs-attention, 7-day schedule, workload projection
- [x] Technicians get their own jobs first, not org-wide KPIs
- [x] Compliance by customer, technician throughput, service history
- [x] CSV export with UTF-8 BOM so Excel keeps the diacritics

## Phase 18 — Demo organization
- [x] Deterministic fixture: 4 customers, 6 locations, 20 devices, 11 work orders, 72 reminders
- [x] Includes completed history with checklist results (one deliberate failed check) so reports and PDFs are populated on first open
- [x] `npm run db:reset` — one-command reset with real 43-char tokens

## Phase 19 — Automated tests
- [x] Domain unit tests (9 suites)
- [x] Repository parity, scheduling, import parsing, QR, PDF, work-order flow, reminder dispatch, booking race
- [x] **356 tests across 17 files**

## Phase 20 — Verification gate
- [x] `npm run lint` — 0 errors, 0 warnings
- [x] `npm run typecheck` — 0 errors
- [x] `npm run test` — 356/356 pass
- [x] `npm run build` — succeeds, 37 routes
- [x] Runtime smoke test against the production build (see below)

---

## Verification

Last run against the production build on a clean `.data` store:

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run test` | 356 passed / 17 files |
| `npm run build` | 37 routes |
| All 13 `/app` routes | 200 |
| Public `/d/[token]`, `/book`, `/report` | 200 · unknown token → 404 |
| Public page data-leak audit | no customer name, email, phone, contact or internal ids in the HTML |
| Cron auth | no/wrong bearer → 401 · GET → 405 · no secret configured → 503 (fails closed) |
| Cron dispatch | run 1 `{scanned:3, sent:3}` · runs 2 and 3 `{sent:0}` — idempotent |
| PDF report | 200, `application/pdf`, 2 pages, byte-identical on regeneration |
| CSV exports | all three kinds 200 with correct headers |

---

## Known gaps

- [!] **No pagination.** List pages read a whole tenant; the reminder log caps at 500 and report history at 60, both with a visible note. Fine to thousands of devices, not to hundreds of thousands.
- [!] **Email is a console transport.** `ReminderTransport` is the seam; wiring a real provider is one file.
- [!] **`updateDeviceType` / `deleteDeviceType` and `getReminder`** are absent from the `Repository`, so device types are create-only and `retryReminder` scans the org's reminders.
- [!] **Supabase RLS is verified by SQL assertions, not by the running app** — no live Supabase project exists in this environment. The migrations were applied and 46 policy assertions passed against a real PostgreSQL 16 cluster, but the end-to-end app has only been exercised against `JsonRepository`.
- [!] **Contact form is not wired** (`// TODO: wire to /api/contact`), by design — there is no mail provider yet.
