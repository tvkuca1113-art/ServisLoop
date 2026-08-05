import { CircleCheck, Database, ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Badge, Separator } from '@/components/ui';
import { env, isServiceRoleConfigured, isSupabaseConfigured } from '@/lib/env';
import { DEFAULT_STORE_PATH } from '@/server/data';

/**
 * Which repository adapter is live, and what it would take to change that.
 *
 * Deliberately reports *whether* each secret is set, never its value — this page is
 * visible to every member of the organisation, and a service-role key on screen is a
 * service-role key in a screenshot.
 *
 * A Server Component: `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` have no `NEXT_PUBLIC_`
 * prefix and must not reach the browser, not even as a boolean derived on the client.
 */
export function DataSourcePanel() {
  const supabase = isSupabaseConfigured();
  const serviceRole = isServiceRoleConfigured();
  const cronSecret = Boolean(env.cronSecret);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink">Data source</h2>
        <p className="text-sm text-ink-muted">
          ServisLoop reads and writes through one repository interface with two adapters.
          Nothing above that interface — no page, no action, no domain function — knows which
          one is live.
        </p>
      </div>

      {supabase ? (
        <Alert variant="success" icon={<CircleCheck />}>
          <AlertTitle>Connected to Supabase</AlertTitle>
          <AlertDescription>
            Queries run as the signed-in user, so Postgres row-level security decides which
            rows are visible. The application permission checks and the RLS policies mirror
            each other on purpose: a bug in one is caught by the other.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="info" icon={<Database />}>
          <AlertTitle>Offline — using the local file store</AlertTitle>
          <AlertDescription>
            <p>
              Every read and write goes to{' '}
              <code className="font-mono text-xs">{DEFAULT_STORE_PATH}</code>, seeded with the
              demo maintenance company. This is a real driver, not a mock: the same repository
              code paths run, so the app is fully usable — and fully testable — with no
              external services.
            </p>
            <p className="mt-2">
              Rebuild the demo from scratch at any time with{' '}
              <code className="font-mono text-xs">npm run db:reset</code>.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">Environment</h3>
        <dl className="flex flex-col gap-0">
          <EnvRow
            name="NEXT_PUBLIC_SUPABASE_URL"
            set={Boolean(env.supabaseUrl)}
            value={env.supabaseUrl}
            note="Project URL. Public by design — it is compiled into the browser bundle."
          />
          <EnvRow
            name="NEXT_PUBLIC_SUPABASE_ANON_KEY"
            set={Boolean(env.supabaseAnonKey)}
            note="Anonymous key. Safe to expose; RLS is what protects the data."
          />
          <EnvRow
            name="SUPABASE_SERVICE_ROLE_KEY"
            set={serviceRole}
            note="Server-only. Needed to invite members and to serve the public QR, booking and issue endpoints."
          />
          <EnvRow
            name="CRON_SECRET"
            set={cronSecret}
            note="Bearer token for POST /api/cron/reminders, so only your scheduler can trigger a send."
          />
          <EnvRow
            name="NEXT_PUBLIC_APP_URL"
            set={Boolean(env.appUrl)}
            value={env.appUrl}
            note="Used for QR code targets and the links inside reminder emails."
          />
        </dl>
      </section>

      {supabase ? null : (
        <>
          <Separator />
          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck aria-hidden="true" className="size-4 text-ink-muted" />
              Connecting Supabase
            </h3>
            <ol className="flex list-inside list-decimal flex-col gap-2 text-sm text-ink-muted">
              <li>
                Create a project at <span className="text-ink">supabase.com</span> and apply the
                seven migrations in{' '}
                <code className="font-mono text-xs">supabase/migrations/</code>. They create the
                fifteen tables, the indexes and the RLS policies that mirror{' '}
                <code className="font-mono text-xs">src/domain/permissions.ts</code>.
              </li>
              <li>
                Copy <code className="font-mono text-xs">.env.example</code> to{' '}
                <code className="font-mono text-xs">.env.local</code> and fill in the project
                URL and anon key from Settings → API.
              </li>
              <li>
                Add <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> if you
                want member invitations and the public QR pages to work.
              </li>
              <li>
                Restart the dev server. The adapter is chosen at runtime in{' '}
                <code className="font-mono text-xs">src/server/data/index.ts</code>; no code
                changes are needed anywhere else.
              </li>
            </ol>
            <p className="text-sm text-ink-muted">
              The local file store is left untouched, so you can switch back by clearing the two
              public variables.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function EnvRow({
  name,
  set,
  value,
  note,
}: {
  name: string;
  set: boolean;
  /** Only ever passed for values that are already public. */
  value?: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border-base py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <dt className="flex min-w-0 flex-1 flex-col gap-1">
        <code className="font-mono text-xs text-ink">{name}</code>
        <span className="text-sm text-ink-muted">{note}</span>
      </dt>
      <dd className="flex shrink-0 items-center gap-2">
        {value && set ? (
          <span className="max-w-56 truncate font-mono text-xs text-ink-subtle">{value}</span>
        ) : null}
        <Badge variant={set ? 'ok' : 'neutral'}>{set ? 'Set' : 'Not set'}</Badge>
      </dd>
    </div>
  );
}
