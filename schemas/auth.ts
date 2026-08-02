import { z } from 'zod'

/**
 * Sheme za autentifikaciju i registraciju.
 *
 * Iste sheme koriste i obrazac u pregledniku i serverska akcija. Time je
 * nemoguće da klijent i server imaju različita pravila — a serverska provjera
 * je ta koja stvarno odlučuje.
 */

const emailField = z
  .string()
  .trim()
  .min(1, 'Unesite e-mail adresu')
  .max(254, 'E-mail adresa je predugačka')
  .toLowerCase()
  .refine(
    (value) => /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(value),
    'Unesite ispravnu e-mail adresu',
  )

/**
 * Lozinka: najmanje 10 znakova.
 *
 * Namjerno BEZ zahtjeva za velikim slovom, brojem i posebnim znakom.
 * Takva pravila u praksi vode na „Lozinka1!“ — kraću i predvidiviju od
 * duže obične fraze. Dužina je najvažnija.
 */
const passwordField = z
  .string()
  .min(10, 'Lozinka mora imati najmanje 10 znakova')
  .max(128, 'Lozinka može imati najviše 128 znakova')

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Unesite lozinku'),
  redirectTo: z.string().optional(),
})

export type SignInInput = z.infer<typeof signInSchema>

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Unesite ime i prezime').max(120, 'Ime je predugačko'),
    email: emailField,
    password: passwordField,
    passwordConfirm: z.string(),
    organizationName: z
      .string()
      .trim()
      .min(2, 'Unesite naziv firme')
      .max(120, 'Naziv firme je predugačak'),
    acceptTerms: z.boolean().refine((value) => value, 'Morate prihvatiti uslove korištenja'),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Lozinke se ne poklapaju',
    path: ['passwordConfirm'],
  })

export type SignUpInput = z.infer<typeof signUpSchema>

export const forgotPasswordSchema = z.object({
  email: emailField,
})

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Lozinke se ne poklapaju',
    path: ['passwordConfirm'],
  })

/** Zajednički oblik odgovora serverskih akcija. */
export interface ActionResult<T = undefined> {
  ok: boolean
  message: string | null
  /** Greške po poljima — obrazac ih prikazuje uz odgovarajuće polje. */
  fieldErrors?: Record<string, string>
  data?: T
}

export function actionError(
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, message, fieldErrors }
}

export function actionSuccess<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, message: message ?? null, data }
}

/** Pretvara Zod greške u mapu po poljima. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    if (!result[key]) result[key] = issue.message
  }
  return result
}
