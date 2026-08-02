'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, CreditCard, LifeBuoy, LogOut, Settings, Users } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar } from '@/components/ui/display'
import { Badge } from '@/components/ui/badge'
import { ROLE_LABELS, can, type Role } from '@/domains/auth/permissions'
import { signOut } from '@/app/(auth)/actions'
import { toast } from '@/components/ui/toast'

export function UserMenu({ name, email, role }: { name: string; email: string; role: Role }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function handleSignOut() {
    startTransition(async () => {
      const result = await signOut()
      if (result.ok) {
        router.push('/prijava')
        router.refresh()
      } else {
        toast.error('Odjava nije uspjela. Pokušajte ponovo.')
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Korisnički meni"
          className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Avatar name={name || email} size="sm" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-fg">{name || 'Bez imena'}</p>
          <p className="truncate text-xs text-fg-muted">{email}</p>
          <Badge tone="brand" size="sm" className="mt-2">
            {ROLE_LABELS[role]}
          </Badge>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Postavke</DropdownMenuLabel>

        <DropdownMenuItem asChild>
          <Link href="/app/postavke">
            <Settings aria-hidden="true" />
            Moj profil
          </Link>
        </DropdownMenuItem>

        {can(role, 'organization.update') ? (
          <DropdownMenuItem asChild>
            <Link href="/app/postavke/organizacija">
              <Building2 aria-hidden="true" />
              Organizacija
            </Link>
          </DropdownMenuItem>
        ) : null}

        {can(role, 'team.view') ? (
          <DropdownMenuItem asChild>
            <Link href="/app/postavke/tim">
              <Users aria-hidden="true" />
              Tim
            </Link>
          </DropdownMenuItem>
        ) : null}

        {can(role, 'billing.view') ? (
          <DropdownMenuItem asChild>
            <Link href="/app/postavke/pretplata">
              <CreditCard aria-hidden="true" />
              Plan i pretplata
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/kontakt">
            <LifeBuoy aria-hidden="true" />
            Pomoć i podrška
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem destructive onSelect={handleSignOut} disabled={pending}>
          <LogOut aria-hidden="true" />
          {pending ? 'Odjava…' : 'Odjavi se'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
