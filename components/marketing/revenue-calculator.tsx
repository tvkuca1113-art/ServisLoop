'use client'

import * as React from 'react'
import { Calculator, Info } from 'lucide-react'
import { Section, SectionIntro } from './section'
import { Input } from '@/components/ui/input'
import { formatCount, formatCurrency, formatPercent } from '@/lib/format'
import {
  REVENUE_DEFAULTS,
  REVENUE_INPUT_BOUNDS,
  estimateRevenue,
  type RevenueEstimateInput,
} from '@/domains/analytics/revenue'
import { cn } from '@/lib/utils'

/**
 * Kalkulator prihoda.
 *
 * Formula je vidljiva korisniku i računa se determinističkom funkcijom iz
 * `domains/analytics/revenue.ts` koja ima vlastite testove. Rezultat je
 * eksplicitno označen kao procjena — ne kao obećanje.
 */
export function RevenueCalculator() {
  const [input, setInput] = React.useState<RevenueEstimateInput>(REVENUE_DEFAULTS)
  const result = React.useMemo(() => estimateRevenue(input), [input])

  function update(key: keyof RevenueEstimateInput, value: number) {
    setInput((current) => ({ ...current, [key]: value }))
  }

  return (
    <Section tone="edge">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div>
          <SectionIntro
            eyebrow="Prilika u brojkama"
            title="Koliko vrijedi vaša instalirana baza?"
            description="Unesite svoje brojeve. Računica je namjerno jednostavna i vidljiva — bez skrivenih pretpostavki i bez podataka o „prosjeku tržišta“."
          />

          <div className="mt-8 space-y-6">
            <SliderField
              id="calc-devices"
              label="Broj instaliranih uređaja"
              value={input.deviceCount}
              bounds={REVENUE_INPUT_BOUNDS.deviceCount}
              onChange={(value) => update('deviceCount', value)}
              format={(value) => formatCount(value)}
            />

            <SliderField
              id="calc-price"
              label="Prosječna cijena servisa"
              value={input.averageServicePriceKm}
              bounds={REVENUE_INPUT_BOUNDS.averageServicePriceKm}
              onChange={(value) => update('averageServicePriceKm', value)}
              format={(value) => formatCurrency(value, { decimals: 0 })}
            />

            <SliderField
              id="calc-rate"
              label="Kupaca koji rezervišu nakon podsjetnika"
              value={input.bookingRate}
              bounds={REVENUE_INPUT_BOUNDS.bookingRate}
              onChange={(value) => update('bookingRate', value)}
              format={(value) => formatPercent(value)}
              hint="Ovo je vaša pretpostavka. Nakon prvog kruga podsjetnika sistem prikazuje stvarnu vrijednost."
            />

            <SliderField
              id="calc-frequency"
              label="Servisa po uređaju godišnje"
              value={input.servicesPerYear}
              bounds={REVENUE_INPUT_BOUNDS.servicesPerYear}
              onChange={(value) => update('servicesPerYear', value)}
              format={(value) => `${value.toString().replace('.', ',')}×`}
            />
          </div>
        </div>

        <div className="rounded-panel border border-line bg-surface/60 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-primary">
            <Calculator className="size-4.5" aria-hidden="true" />
            <h3 className="text-sm font-semibold tracking-wide uppercase">Procjena</h3>
          </div>

          <dl className="mt-6 space-y-6" aria-live="polite">
            <div>
              <dt className="text-sm text-fg-muted">Mogućih servisnih termina godišnje</dt>
              <dd className="tabular mt-1 text-display-sm text-fg">
                {formatCount(result.yearlyAppointments)}
              </dd>
            </div>

            <div className="border-t border-line pt-6">
              <dt className="text-sm text-fg-muted">Mogući godišnji prihod od servisa</dt>
              <dd className="tabular mt-1 text-display-md text-gradient-brand">
                {formatCurrency(result.yearlyRevenueKm, { decimals: 0 })}
              </dd>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-line pt-6">
              <div>
                <dt className="text-xs text-fg-muted">Mjesečno</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-fg">
                  {formatCurrency(result.monthlyRevenueKm, { decimals: 0 })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Po uređaju godišnje</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-fg">
                  {formatCurrency(result.revenuePerDeviceKm, { decimals: 0 })}
                </dd>
              </div>
            </div>
          </dl>

          <div className="mt-8 space-y-3 rounded-card border border-line bg-canvas/40 p-4">
            <p className="font-mono text-[0.6875rem] leading-relaxed text-fg-subtle">
              termini = uređaji × servisa godišnje × stopa rezervacije
              <br />
              prihod&nbsp;&nbsp;= termini × cijena servisa
            </p>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-fg-subtle">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Ovo je procjena na osnovu vaših unosa, a ne obećanje prihoda. Stvarni rezultat
              ovisi o kvalitetu kontakt podataka, cijeni i sposobnosti tima da odradi termine.
            </span>
          </p>
        </div>
      </div>
    </Section>
  )
}

function SliderField({
  id,
  label,
  value,
  bounds,
  onChange,
  format,
  hint,
}: {
  id: string
  label: string
  value: number
  bounds: { min: number; max: number; step: number }
  onChange: (value: number) => void
  format: (value: number) => string
  hint?: string
}) {
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        <output htmlFor={id} className="tabular text-sm font-semibold text-primary">
          {format(value)}
        </output>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <input
          id={id}
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={value}
          aria-describedby={hintId}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cn(
            'h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-muted',
            'accent-brand-400',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none',
          )}
        />
        <Input
          type="number"
          inputSize="sm"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={value}
          aria-label={`${label} — unos brojem`}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
          className="w-24 text-right tabular-nums"
        />
      </div>

      {hint ? (
        <p id={hintId} className="mt-2 text-xs leading-relaxed text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
