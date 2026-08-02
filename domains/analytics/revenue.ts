/**
 * Procjena prihoda od servisa.
 *
 * Formule su namjerno jednostavne i vidljive korisniku. Nikakva „pametna“
 * projekcija, nikakav podatak o prosjeku tržišta koji ne možemo dokazati —
 * samo množenje brojeva koje je sam korisnik unio.
 *
 * Rezultat je UVIJEK označen kao procjena. Vidi `docs/KNOWN_LIMITATIONS.md`.
 */

export interface RevenueEstimateInput {
  /** Broj instaliranih uređaja koje firma vodi. */
  deviceCount: number
  /** Prosječna cijena jednog servisa u KM. */
  averageServicePriceKm: number
  /** Udio kupaca koji rezervišu nakon podsjetnika (0–1). */
  bookingRate: number
  /** Prosječan broj servisa po uređaju godišnje. */
  servicesPerYear: number
}

export interface RevenueEstimate {
  /** Broj mogućih servisnih termina godišnje. */
  yearlyAppointments: number
  /** Mogući godišnji prihod od servisa, u KM. */
  yearlyRevenueKm: number
  /** Mogući mjesečni prihod od servisa, u KM. */
  monthlyRevenueKm: number
  /** Prihod po uređaju godišnje — koristan za poređenje s cijenom plana. */
  revenuePerDeviceKm: number
}

export const REVENUE_INPUT_BOUNDS = {
  deviceCount: { min: 1, max: 20_000, step: 10 },
  averageServicePriceKm: { min: 10, max: 1_000, step: 5 },
  bookingRate: { min: 0.01, max: 1, step: 0.01 },
  servicesPerYear: { min: 0.5, max: 4, step: 0.5 },
} as const

/** Vrijednosti s kojima kalkulator startuje. To su primjeri, ne tvrdnje o tržištu. */
export const REVENUE_DEFAULTS: RevenueEstimateInput = {
  deviceCount: 400,
  averageServicePriceKm: 80,
  bookingRate: 0.35,
  servicesPerYear: 1,
}

function clampToBounds(value: number, bounds: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return bounds.min
  return Math.min(bounds.max, Math.max(bounds.min, value))
}

/** Svodi korisnički unos na dopušteni raspon prije računanja. */
export function normalizeRevenueInput(input: Partial<RevenueEstimateInput>): RevenueEstimateInput {
  return {
    deviceCount: Math.round(
      clampToBounds(input.deviceCount ?? REVENUE_DEFAULTS.deviceCount, REVENUE_INPUT_BOUNDS.deviceCount),
    ),
    averageServicePriceKm: clampToBounds(
      input.averageServicePriceKm ?? REVENUE_DEFAULTS.averageServicePriceKm,
      REVENUE_INPUT_BOUNDS.averageServicePriceKm,
    ),
    bookingRate: clampToBounds(
      input.bookingRate ?? REVENUE_DEFAULTS.bookingRate,
      REVENUE_INPUT_BOUNDS.bookingRate,
    ),
    servicesPerYear: clampToBounds(
      input.servicesPerYear ?? REVENUE_DEFAULTS.servicesPerYear,
      REVENUE_INPUT_BOUNDS.servicesPerYear,
    ),
  }
}

/**
 * Procjena godišnjeg i mjesečnog prihoda.
 *
 *   termini  = uređaji × servisa godišnje × stopa rezervacije
 *   prihod   = termini × cijena servisa
 *   mjesečno = prihod ÷ 12
 *
 * Broj termina se zaokružuje naniže — pola servisa ne postoji.
 */
export function estimateRevenue(rawInput: Partial<RevenueEstimateInput>): RevenueEstimate {
  const input = normalizeRevenueInput(rawInput)

  const yearlyAppointments = Math.floor(
    input.deviceCount * input.servicesPerYear * input.bookingRate,
  )
  const yearlyRevenueKm = Math.round(yearlyAppointments * input.averageServicePriceKm)
  const monthlyRevenueKm = Math.round(yearlyRevenueKm / 12)
  const revenuePerDeviceKm =
    input.deviceCount > 0 ? Math.round(yearlyRevenueKm / input.deviceCount) : 0

  return { yearlyAppointments, yearlyRevenueKm, monthlyRevenueKm, revenuePerDeviceKm }
}

// ---------------------------------------------------------------------------
// Prihod unutar aplikacije — na temelju stvarnih zapisa, ne procjene
// ---------------------------------------------------------------------------

export interface RevenueOpportunityInput {
  /** Uređaji kojima rok servisa dolazi u posmatranom periodu. */
  dueDevices: Array<{ servicePriceKm: number | null }>
  /** Zakazane rezervacije s dogovorenom cijenom. */
  scheduledServices: Array<{ priceKm: number | null }>
  /** Završeni servisi u periodu. */
  completedServices: Array<{ priceKm: number | null }>
  /** Zamjenska cijena kad uređaj nema svoju. */
  fallbackPriceKm: number
}

export interface RevenueOpportunity {
  /** Prihod koji BI mogao nastati ako svi dospjeli uređaji budu servisirani. */
  potentialKm: number
  /** Prihod iz već potvrđenih termina. */
  bookedKm: number
  /** Prihod iz završenih servisa. */
  completedKm: number
  /** Koliko uređaja nema definisanu cijenu (koristi se zamjenska). */
  devicesWithoutPrice: number
  counts: { due: number; scheduled: number; completed: number }
}

/**
 * Razlaže prihod na tri jasno odvojene kategorije.
 *
 * Ključno pravilo proizvoda: `potentialKm` NIJE prihod. To je gornja granica
 * koja pretpostavlja da svaki dospjeli uređaj bude servisiran. U korisničkom
 * sučelju se uvijek prikazuje kao „Potencijalni prihod (procjena)“, odvojeno
 * od „Rezervisano“ i „Završeno“.
 */
export function calculateRevenueOpportunity(
  input: RevenueOpportunityInput,
): RevenueOpportunity {
  let devicesWithoutPrice = 0

  const potentialKm = input.dueDevices.reduce((sum, device) => {
    if (device.servicePriceKm === null || device.servicePriceKm <= 0) {
      devicesWithoutPrice += 1
      return sum + input.fallbackPriceKm
    }
    return sum + device.servicePriceKm
  }, 0)

  const bookedKm = input.scheduledServices.reduce(
    (sum, service) => sum + (service.priceKm ?? input.fallbackPriceKm),
    0,
  )

  const completedKm = input.completedServices.reduce(
    (sum, service) => sum + (service.priceKm ?? 0),
    0,
  )

  return {
    potentialKm: Math.round(potentialKm * 100) / 100,
    bookedKm: Math.round(bookedKm * 100) / 100,
    completedKm: Math.round(completedKm * 100) / 100,
    devicesWithoutPrice,
    counts: {
      due: input.dueDevices.length,
      scheduled: input.scheduledServices.length,
      completed: input.completedServices.length,
    },
  }
}

/**
 * Konverzija podsjetnika u rezervacije.
 * Vraća `null` kad nema poslanih podsjetnika — dijeljenje nulom bi dalo
 * besmislenih „0 %“ koji izgleda kao loš rezultat umjesto kao nedostatak podataka.
 */
export function reminderConversionRate(
  remindersSent: number,
  bookingsFromReminders: number,
): number | null {
  if (remindersSent <= 0) return null
  return Math.min(1, bookingsFromReminders / remindersSent)
}
