import type { Metadata } from 'next'
import Link from 'next/link'
import { SignInForm } from './sign-in-form'
import { publicEnv, isSupabaseConfigured } from '@/lib/env'
import { Alert } from '@/components/ui/feedback'

export const metadata: Metadata = {
  title: 'Prijava',
  description: 'Prijavite se u svoj ServisLoop nalog.',
  robots: { index: false, follow: false },
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ nastavi?: string; poruka?: string }>
}) {
  const params = await searchParams
  const configured = isSupabaseConfigured()

  return (
    <div>
      <h1 className="text-display-sm text-fg">Prijava</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Nemate nalog?{' '}
        <Link
          href="/registracija"
          className="font-medium text-primary underline underline-offset-4 hover:brightness-110"
        >
          Otvorite ga besplatno
        </Link>
        .
      </p>

      {!configured ? (
        <Alert tone="warning" title="Supabase nije povezan" className="mt-6">
          Aplikacija još nema pristup bazi. Postavite <code>NEXT_PUBLIC_SUPABASE_URL</code> i{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> u <code>.env.local</code>. Upute su u{' '}
          <code>docs/SUPABASE_SETUP.md</code>.
        </Alert>
      ) : null}

      {params.poruka === 'odjava' ? (
        <Alert tone="success" className="mt-6">
          Uspješno ste odjavljeni.
        </Alert>
      ) : null}

      <div className="mt-8">
        <SignInForm redirectTo={params.nastavi} disabled={!configured} />
      </div>

      {publicEnv.NEXT_PUBLIC_DEMO_MODE ? (
        <p className="mt-8 rounded-lg border border-line bg-surface/50 p-4 text-xs leading-relaxed text-fg-muted">
          Želite prvo pogledati kako radi?{' '}
          <Link href="/demo" className="text-primary underline underline-offset-2">
            Otvorite demo
          </Link>{' '}
          s popunjenom firmom, uređajima i servisima.
        </p>
      ) : null}
    </div>
  )
}
