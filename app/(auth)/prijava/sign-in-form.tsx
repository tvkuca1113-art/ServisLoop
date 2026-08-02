'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { signIn } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FormErrorSummary } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'

/**
 * Obrazac za prijavu.
 *
 * Validacija se radi na serveru (`signIn`), a rezultat se vraća s greškama po
 * poljima. Klijent koristi nativnu HTML validaciju kao prvi filter, ali odluka
 * je uvijek serverska.
 */
export function SignInForm({
  redirectTo,
  disabled = false,
}: {
  redirectTo?: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = React.useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setFormError(null)
    setFieldErrors({})

    startTransition(async () => {
      const result = await signIn(formData)

      if (!result.ok) {
        setFormError(result.message)
        setFieldErrors(result.fieldErrors ?? {})
        return
      }

      router.push(result.data?.redirectTo ?? '/app/pregled')
      router.refresh()
    })
  }

  const summaryErrors = Object.entries(fieldErrors).map(([field, message]) => ({ field, message }))

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

      {formError ? (
        <Alert tone="danger" live="assertive">
          {formError}
        </Alert>
      ) : null}

      <FormErrorSummary errors={summaryErrors} />

      <Field id="email" label="E-mail adresa" error={fieldErrors.email} required>
        {(field) => (
          <Input
            {...field}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="vi@vasafirma.ba"
            disabled={disabled}
            required
          />
        )}
      </Field>

      <Field id="password" label="Lozinka" error={fieldErrors.password} required>
        {(field) => (
          <div className="relative">
            <Input
              {...field}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              disabled={disabled}
              required
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Sakrij lozinku' : 'Prikaži lozinku'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-fg-subtle transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </Field>

      <div className="flex justify-end">
        <Link
          href="/zaboravljena-lozinka"
          className="text-xs text-fg-muted underline underline-offset-4 transition-colors hover:text-fg"
        >
          Zaboravili ste lozinku?
        </Link>
      </div>

      <Button type="submit" block size="lg" loading={pending} disabled={disabled}>
        Prijavi se
      </Button>
    </form>
  )
}
