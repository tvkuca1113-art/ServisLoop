'use client';

import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useActionState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { switchOrganization } from '@/server/actions/org';
import type { ActionResult } from '@/server/actions/result';

/**
 * Active-organisation picker.
 *
 * Each option is its own `<form>` submitting the organisation id, rather than a click
 * handler that calls the action. That keeps the choice in the request body where the
 * server re-checks membership against the session — the switcher is a convenience, not
 * the authority on what someone may open.
 */

export interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

export interface OrgSwitcherProps {
  organizations: readonly OrgOption[];
  activeId: string;
  /** Icon-only, for the collapsed sidebar. */
  compact?: boolean;
  className?: string;
}

export function OrgSwitcher({
  organizations,
  activeId,
  compact = false,
  className,
}: OrgSwitcherProps) {
  const [result, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    async (_previous, formData) => switchOrganization(formData),
    null,
  );

  const active = organizations.find((o) => o.id === activeId) ?? organizations[0];
  const failed = result && !result.ok ? result.error : null;

  if (!active) return null;

  // Nothing to switch between — render the name, not a control that does nothing.
  if (organizations.length === 1) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
          compact && 'justify-center px-0',
          className,
        )}
      >
        <Building2 aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
        {compact ? (
          <span className="sr-only">{active.name}</span>
        ) : (
          <span className="truncate font-medium text-ink">{active.name}</span>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-border-base bg-surface px-2 py-1.5 text-sm text-ink transition-colors',
            'hover:border-border-strong',
            compact && 'justify-center px-0',
          )}
          aria-label={`Active organisation: ${active.name}. Switch organisation`}
        >
          <Building2 aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
          {compact ? null : (
            <>
              <span className="min-w-0 flex-1 truncate text-left font-medium">{active.name}</span>
              {pending ? (
                <Spinner size="sm" label="" />
              ) : (
                <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
              )}
            </>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuLabel>Your organisations</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {organizations.map((org) => {
            const isActive = org.id === active.id;
            return (
              <form key={org.id} action={formAction}>
                <input type="hidden" name="orgId" value={org.id} />
                <DropdownMenuItem asChild disabled={pending}>
                  <button type="submit" className="w-full text-left">
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {isActive ? (
                        <Check aria-hidden="true" className="size-4 text-brand-600" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{org.name}</span>
                      <span className="block truncate text-xs text-ink-subtle">/{org.slug}</span>
                    </span>
                    {isActive ? <span className="sr-only">(current)</span> : null}
                  </button>
                </DropdownMenuItem>
              </form>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {failed ? (
        <p role="alert" className="mt-1 px-2 text-xs text-state-overdue">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
