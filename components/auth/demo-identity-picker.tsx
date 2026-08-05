'use client';

import { Check } from 'lucide-react';
import { useActionState } from 'react';

import { FormAlert } from '@/components/app/forms/form-feedback';
import { RoleBadge } from '@/components/app/role-badge';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { switchDemoIdentity } from '@/server/actions/auth';
import type { ActionResult } from '@/server/actions/result';
import type { DemoIdentity } from '@/server/auth/demo-identities';

/**
 * Pick which seeded member to browse the demo as.
 *
 * One `useActionState` shared by several small forms, rather than one form with several
 * submit buttons: the identity travels in a hidden field, so the choice does not depend on
 * the browser reporting which button submitted the form.
 *
 * The action refuses to run when Supabase is configured, so this can never become an
 * impersonation control in a real deployment.
 */

export interface DemoIdentityPickerProps {
  identities: readonly DemoIdentity[];
  /** The identity currently in effect, marked as selected. */
  activeId?: string;
  /** Where to land after switching. Defaults to `/app`. */
  next?: string;
  layout?: 'cards' | 'inline';
}

export function DemoIdentityPicker({
  identities,
  activeId,
  next,
  layout = 'cards',
}: DemoIdentityPickerProps) {
  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => switchDemoIdentity(formData),
    null,
  );

  if (identities.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        The local store has no demo members yet. Run <code className="font-mono">npm run db:reset</code>{' '}
        to rebuild it.
      </p>
    );
  }

  if (layout === 'inline') {
    return (
      <div className="flex flex-col gap-2">
        {result && !result.ok ? <FormAlert result={result} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          {identities.map((identity) => {
            const isActive = identity.id === activeId;
            return (
              <form key={identity.id} action={formAction}>
                <input type="hidden" name="userId" value={identity.id} />
                {next ? <input type="hidden" name="next" value={next} /> : null}
                <button
                  type="submit"
                  disabled={pending || isActive}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    isActive
                      ? 'border-brand-600 bg-brand-600/10 text-ink'
                      : 'border-border-base bg-surface text-ink-muted hover:border-border-strong hover:text-ink',
                    pending && !isActive && 'opacity-60',
                  )}
                >
                  {isActive ? <Check aria-hidden="true" className="size-3.5 text-brand-600" /> : null}
                  <span>{identity.name}</span>
                  <span className="text-ink-subtle">· {identity.roleLabel}</span>
                  {isActive ? <span className="sr-only">(signed in as)</span> : null}
                </button>
              </form>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {result && !result.ok ? <FormAlert result={result} /> : null}

      <ul className="flex flex-col gap-2">
        {identities.map((identity) => {
          const isActive = identity.id === activeId;
          return (
            <li key={identity.id}>
              <form action={formAction}>
                <input type="hidden" name="userId" value={identity.id} />
                {next ? <input type="hidden" name="next" value={next} /> : null}
                <button
                  type="submit"
                  disabled={pending}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-card border bg-surface p-3 text-left transition-colors',
                    'hover:border-brand-600 hover:bg-brand-600/5',
                    'disabled:pointer-events-none disabled:opacity-60',
                    isActive ? 'border-brand-600' : 'border-border-base',
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{identity.name}</span>
                      <RoleBadge role={identity.role} />
                      {isActive ? (
                        <span className="text-xs text-brand-600">Currently selected</span>
                      ) : null}
                    </span>
                    <span className="truncate text-xs text-ink-muted">{identity.email}</span>
                    <span className="text-xs text-ink-subtle">{identity.roleDescription}</span>
                  </span>
                  {pending ? <Spinner size="sm" label="" className="mt-0.5" /> : null}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
