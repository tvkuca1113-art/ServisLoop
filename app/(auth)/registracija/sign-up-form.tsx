'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signUp } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FormErrorSummary } from '@/components/ui/field'
import { CheckboxField } from '@/components/ui/controls'
import { Alert } from '@/components/ui/feedback'

export function SignUpForm({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [acceptTerms, setAcceptTerms] = React.useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set('acceptTerms', acceptTerms ? 'true' : 'false')

    setFormError(null)
    setFieldErrors({})

    startTransition(async () => {
      const result = await signUp(formData)

      if (!result.ok) {
        setFormError(result.message)
        setFieldErrors(result.fieldErrors ?? {})
        return
      }

      router.push(result.data?.redirectTo ?? '/app/onboarding')
      router.refresh()
    })
  }

  const summaryErrors = Object.entries(fieldErrors).map(([field, message]) => ({ field, message }))

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError ? (
        <Alert tone="danger" live="assertive">
          {formError}
        </Alert>
      ) : null}

      <FormErrorSummary errors={summaryErrors} />

      <Field
        id="organizationName"
        label="Naziv firme"
        error={fieldErrors.organizationName}
        required
      >
        {(field) => (
          <Input
            {...field}
            name="organizationName"
            autoComplete="organization"
            placeholder="TermoPlus Servis d.o.o."
            disabled={disabled}
            required
          />
        )}
      </Field>

      <Field id="fullName" label="Vaše ime i prezime" error={fieldErrors.fullName} required>
        {(field) => (
          <Input
            {...field}
            name="fullName"
            autoComplete="name"
            placeholder="Amir Hodžić"
            disabled={disabled}
            required
          />
        )}
      </Field>

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

      <Field
        id="password"
        label="Lozinka"
        error={fieldErrors.password}
        hint="Najmanje 10 znakova. Duža obična fraza je sigurnija od kratke složene lozinke."
        required
      >
        {(field) => (
          <Input
            {...field}
            name="password"
            type="password"
            autoComplete="new-password"
            disabled={disabled}
            required
            minLength={10}
          />
        )}
      </Field>

      <Field
        id="passwordConfirm"
        label="Ponovite lozinku"
        error={fieldErrors.passwordConfirm}
        required
      >
        {(field) => (
          <Input
            {...field}
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            disabled={disabled}
            required
          />
        )}
      </Field>

      <CheckboxField
        id="acceptTerms"
        checked={acceptTerms}
        onCheckedChange={(checked) => setAcceptTerms(checked === true)}
        disabled={disabled}
        label={
          <>
            Prihvatam{' '}
            <Link href="/uslovi-koristenja" className="text-primary underline underline-offset-2">
              uslove korištenja
            </Link>{' '}
            i{' '}
            <Link
              href="/politika-privatnosti"
              className="text-primary underline underline-offset-2"
            >
              politiku privatnosti
            </Link>
            .
          </>
        }
      />
      {fieldErrors.acceptTerms ? (
        <p className="text-critical text-xs font-medium">{fieldErrors.acceptTerms}</p>
      ) : null}

      <Button type="submit" block size="lg" loading={pending} disabled={disabled}>
        Otvori nalog
      </Button>
    </form>
  )
}
