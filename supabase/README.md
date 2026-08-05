# ServisLoop — Supabase

The Postgres schema, row-level security policies and triggers behind ServisLoop.

The application runs **without any of this**: with no Supabase environment variables
set, `src/server/data/index.ts` selects the file-backed `JsonRepository` and the app is
fully browsable offline. Everything here is for the production data path.

---

## Layout

| File | Contents |
|---|---|
| `config.toml` | Local stack configuration (ports, exposed schemas, auth). |
| `migrations/0001_extensions.sql` | `extensions` schema, `pgcrypto`. |
| `migrations/0002_core_tables.sql` | The 12 enum types, then organizations → profiles → memberships → customers → locations → checklists → device types → devices. |
| `migrations/0003_operations_tables.sql` | Work orders, checklist results, bookings, issues, reminders, service reports, business hours, blackout dates, audit log, and the per-org work-order code sequence. |
| `migrations/0004_indexes.sql` | Access paths, plus two correctness-bearing partial unique indexes. |
| `migrations/0005_rls_helpers.sql` | `SECURITY DEFINER` functions every policy is built from. |
| `migrations/0006_rls_policies.sql` | The permission matrix from `src/domain/permissions.ts`, in SQL. |
| `migrations/0007_triggers.sql` | `updated_at`, profile creation on sign-up, service-date write-back, audit log. |

Migrations are applied in filename order and are written to be replay-safe: every
`create table` is `if not exists`, enum creation is guarded with `to_regtype()`, and
every policy and trigger is dropped by name before it is created.

---

## Running it locally

Prerequisites: Docker, and the [Supabase CLI](https://supabase.com/docs/guides/local-development)
(`brew install supabase/tap/supabase`, `npx supabase`, or the release binary).

```bash
# Start Postgres, GoTrue, PostgREST, Studio and the mail catcher.
supabase start

# Drop the local database, replay every migration in order, then apply
# supabase/seed.sql if it exists. This is the command to run after pulling
# changes to any migration.
supabase db reset

# Ports, URLs and the anon / service-role keys for this machine.
supabase status

# Tear everything down (add --no-backup to discard the volume as well).
supabase stop
```

Once started:

- API — <http://127.0.0.1:54321>
- Studio — <http://127.0.0.1:54323>
- Mail catcher (confirmation links, magic links) — <http://127.0.0.1:54324>
- Postgres — `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

---

## Pointing the app at it

Copy `.env.example` to `.env.local` in the repository root and fill in the three
Supabase values from `supabase status`:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`>

CRON_SECRET=local-dev-secret
```

Then `npm run dev`. The repository selection is automatic: `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` being present is what switches the app from
`JsonRepository` to `SupabaseRepository`. To go back to offline mode, blank those two
values — no code change.

The local keys printed by `supabase status` are the same well-known development keys on
every machine. They are safe to paste into `.env.local`, which is gitignored, and must
never be reused for a hosted project.

---

## Two things worth knowing before you edit anything here

### `anon` has no policies, anywhere

Every policy is `to authenticated`. An unauthenticated request matches nothing on
every table.

The three public surfaces — the `/d/[token]` QR page, booking submission and issue
reporting — do not query Postgres as `anon`. They go through server route handlers that
hold the service-role key and are scoped by the unguessable per-device `public_token`.
The reviewable attack surface is therefore a handful of route handlers, rather than
whatever a set of `anon` policies spread across nine tables happens to permit.

Adding one `to anon` policy converts this design into the other one.

### The helpers are `SECURITY DEFINER` to prevent policy recursion

A policy on `memberships` that answered "is the caller a member of this org?" with an
inline `select ... from memberships` would re-enter itself and fail at query time with
`42P17 infinite recursion detected in policy for relation "memberships"`.

`is_org_member()` and friends are `SECURITY DEFINER` and owned by `postgres`, which
owns the tables and is therefore exempt from their RLS. Their internal reads evaluate no
policy, so the recursion cannot start. Two consequences:

- Never run `alter table public.memberships force row level security` — `FORCE` removes
  the owner's exemption and the recursion returns.
- Recreate these functions only as `postgres`. Whoever runs `create or replace` becomes
  the definer and the function inherits *their* visibility.

---

## Changing the schema

1. Edit the relevant migration if the change has not shipped anywhere yet; otherwise add
   `migrations/00NN_<what>.sql`.
2. Keep `src/domain/types.ts` in the same commit. The enums here and the frozen tuples
   there are one vocabulary written twice; a value in only one of them becomes an
   unreachable UI state rather than a compile error.
3. Keep `src/domain/permissions.ts` in the same commit for anything touching access.
   `0006_rls_policies.sql` is a mirror of that matrix and the two are meant to be
   independently sufficient — the point is that a bug in one is caught by the other.
4. `supabase db reset` — a clean replay is the only proof the migration is idempotent
   and correctly ordered.
5. `supabase db diff -f <name>` if you changed the database directly through Studio and
   want the CLI to write the migration for you.

### Deliberate omissions

- **`devices.next_service_due` is never computed in SQL.** It is written by the
  application from `computeNextServiceDue()` in `src/domain/service-interval.ts`, which
  is pure and unit-tested. The completion trigger copies `completed_on` onto
  `devices.last_service_at` and stops there. Two implementations of the scheduling rule
  would drift, and the drift would surface in a signed compliance report.
- **No column-level privileges.** A technician who may update a device row may write any
  column of it. The database enforces tenancy and role; the application enforces which
  fields a given flow may touch.
- **`work_order_checklist_results.item_id` has a deferred foreign key.** Deleting an
  organisation must succeed; deleting a single checklist item that has answers against
  it must not. `on delete no action deferrable initially deferred` is what gives both.
