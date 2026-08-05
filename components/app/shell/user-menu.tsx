'use client';

import { LogOut, Settings, UserCircle, Users } from 'lucide-react';
import Link from 'next/link';

import { RoleBadge } from '@/components/app/role-badge';
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import type { Role } from '@/domain/types';
import { cn, initials } from '@/lib/utils';

/**
 * Account menu.
 *
 * Signing out is a `<form method="post">` to a route handler rather than a click handler,
 * so it works before hydration and with JavaScript disabled — the one control in the shell
 * where "it silently did nothing" is genuinely dangerous, because the person walks away
 * from a shared laptop believing they are signed out.
 */

export interface UserMenuProps {
  name: string;
  email: string;
  role: Role;
  className?: string;
}

export function UserMenu({ name, email, role, className }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-ink/5',
          className,
        )}
        aria-label={`Account menu for ${name}`}
      >
        <Avatar size="md">
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate text-xs font-normal text-ink-muted">{email}</span>
        </DropdownMenuLabel>

        <div className="px-2 pb-1.5">
          <RoleBadge role={role} />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Settings aria-hidden="true" />
            Organisation settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/app/settings/members">
            <Users aria-hidden="true" />
            Members
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/app/settings?tab=data-source">
            <UserCircle aria-hidden="true" />
            Data source
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <form action="/auth/sign-out" method="post">
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full text-left">
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
