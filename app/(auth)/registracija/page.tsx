import type { Metadata } from 'next'
import Link from 'next/link'
import { SignUpForm } from './sign-up-form'
import { isSupabaseConfigured } from '@/lib/env'
import { Alert } from '@/components/ui/feedback'

export const metadata: Metadata = {
  title: 'Otvorite nalog',
  description: 'Otvorite ServisLoop nalog i pokrenite automatske servisne podsjetnike.',
  robots: { index: false, follow: false },
}

export default function SignUpPage() {
  const configured = isSupabaseConfigured()

  return (
    <div>
      <h1 className="text-display-sm text-fg">Otvorite nalog</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Već imate nalog?{' '}
        <Link
          href="/prijava"
          className="font-medium text-primary underline underline-offset-4 hover:brightness-110"
        >
          Prijavite se
        </Link>
        .
      </p>

      {!configured ? (
        <Alert tone="warning" title="Supabase nije povezan" className="mt-6">
          Aplikacija još nema pristup bazi. Upute su u <code>docs/SUPABASE_SETUP.md</code>.
        </Alert>
      ) : null}

      <div className="mt-8">
        <SignUpForm disabled={!configured} />
      </div>

      <p className="mt-6 text-xs leading-relaxed text-fg-subtle">
        30 dana probnog perioda. Kartica se ne traži. Podatke možete izvesti ili obrisati
        u svakom trenutku.
      </p>
    </div>
  )
}
