'use client';

import { Database, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';

import { DemoIdentityPicker } from '@/components/auth/demo-identity-picker';
import type { DemoIdentity } from '@/server/auth/demo-identities';

/**
 * The offline-mode banner.
 *
 * Rendered only when `session.isOffline` — that is, when `isSupabaseConfigured()` is false
 * and the application is reading and writing `.data/store.json`. Two jobs:
 *
 * 1. Say where the data actually lives, so nobody mistakes a seeded demo for their own
 *    records, and point at the settings tab that explains how to connect Supabase.
 * 2. Carry the identity switcher. Role-gated UI is impossible to review if you can only
 *    ever be the owner; here you can become the technician in one click and watch the
 *    invite and delete controls disappear.
 *
 * It is a disclosure rather than an always-open panel because it sits above every page in
 * the product, and a permanent four-name list at the top of the dashboard would be noise
 * after the first minute.
 */

export interface DemoBannerProps {
  identities: readonly DemoIdentity[];
  activeUserId: string;
  activeName: string;
  activeRoleLabel: string;
}

export function DemoBanner({
  identities,
  activeUserId,
  activeName,
  activeRoleLabel,
}: DemoBannerProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-b border-brand-600/25 bg-brand-600/5 text-ink">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm lg:px-6">
        <Database aria-hidden="true" className="size-4 shrink-0 text-brand-600" />

        <p className="min-w-0">
          <span className="font-medium">Demo mode.</span>{' '}
          <span className="text-ink-muted">
            Data is read from and written to the local file store{' '}
            <code className="font-mono text-xs">.data/store.json</code> — no database, no
            network.
          </span>
        </p>

        <Link
          href="/app/settings?tab=data-source"
          className="rounded-md font-medium text-brand-600 underline-offset-4 hover:underline"
        >
          Connect Supabase
        </Link>

        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
          }}
          aria-expanded={open}
          aria-controls={panelId}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border-base bg-surface px-2 py-1 text-xs font-medium text-ink transition-colors hover:border-border-strong"
        >
          <UserCircle aria-hidden="true" className="size-3.5 text-ink-muted" />
          <span>
            Viewing as {activeName}
            <span className="text-ink-subtle"> · {activeRoleLabel}</span>
          </span>
        </button>
      </div>

      {open ? (
        <div id={panelId} className="border-t border-brand-600/20 px-4 py-3 lg:px-6">
          <p className="mb-2 text-xs text-ink-muted">
            Switch identity to test the role gates. Every check runs through the same{' '}
            <code className="font-mono">can(role, action)</code> matrix the production build
            uses.
          </p>
          <DemoIdentityPicker identities={identities} activeId={activeUserId} layout="inline" />
        </div>
      ) : null}
    </div>
  );
}
