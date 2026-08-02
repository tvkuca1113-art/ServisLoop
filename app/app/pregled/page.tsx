import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { requireOrgContext } from '@/lib/auth/session'
import { loadDashboard } from '@/services/dashboard/overview'
import { StatCard, SectionHeading } from '@/components/ui/display'
import { Card, CardBody, CardHeaderRow } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { formatCount, formatCurrency, formatDate, formatPercent, pluralize, PLURALS } from '@/lib/format'
import { evaluateServiceDue } from '@/domains/devices/service-schedule'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Pregled' }

export default async function DashboardPage() {
  const context = await requireOrgContext()
  const data = await loadDashboard(context.organizationId, context.timeZone)

  const hasAnyDevices = data.metrics.activeDevices > 0

  return (
    <div className="space-y-8">
      <SectionHeading
        as="h1"
        title={`Dobro došli, ${context.user.fullName?.split(' ')[0] ?? 'kolega'}`}
        description={
          hasAnyDevices
            ? `${formatCount(data.metrics.activeDevices)} aktivnih uređaja u vašoj bazi. Ovo je stanje na dan ${formatDate(data.today)}.`
            : 'Počnite dodavanjem prvog uređaja ili uvozom postojeće baze iz Excela.'
        }
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/app/uvoz">Uvezi bazu</Link>
            </Button>
            <Button asChild>
              <Link href="/app/uredaji/novi">Dodaj uređaj</Link>
            </Button>
          </>
        }
      />

      {!hasAnyDevices ? (
        <EmptyState
          icon={Wrench}
          title="Još nema uređaja u bazi"
          description="ServisLoop radi tako što prati rokove servisa vaše instalirane opreme. Uvezite postojeću bazu iz Excela ili dodajte prvi uređaj ručno — podsjetnici kreću odmah nakon toga."
          action={
            <Button asChild>
              <Link href="/app/uvoz">Uvezi iz Excela ili CSV-a</Link>
            </Button>
          }
          secondaryAction={
            <Button asChild variant="secondary">
              <Link href="/app/uredaji/novi">Dodaj uređaj ručno</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Prihod */}
          <section aria-labelledby="prihod-naslov" className="space-y-4">
            <h2 id="prihod-naslov" className="text-sm font-semibold text-fg">
              Servisni prihod
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Potencijalni prihod"
                value={formatCurrency(data.revenue.potentialKm, { decimals: 0 })}
                caption={`${pluralize(data.metrics.dueIn30 + data.metrics.overdue, PLURALS.uredaj)} dospijeva ili kasni`}
                icon={TrendingUp}
                tone="primary"
                help="Zbir cijena servisa za uređaje kojima je rok prošao ili dolazi u 30 dana. Ovo je procjena, ne zagarantovan prihod — pretpostavlja da svaki uređaj bude servisiran."
              />
              <StatCard
                label="Rezervisani prihod"
                value={formatCurrency(data.revenue.bookedKm, { decimals: 0 })}
                caption="iz potvrđenih termina"
                icon={CalendarCheck}
                tone="success"
                help="Zbir cijena servisa za termine koji su dogovoreni i još nisu obavljeni."
              />
              <StatCard
                label="Završeni servisi (ovaj mjesec)"
                value={formatCurrency(data.revenue.completedKm, { decimals: 0 })}
                caption={pluralize(data.metrics.completedThisMonth, PLURALS.servis)}
                icon={CheckCircle2}
                tone="neutral"
                help="Stvarno naplaćena vrijednost servisa zatvorenih ovog mjeseca."
              />
            </div>

            {data.revenue.devicesWithoutPrice > 0 ? (
              <p className="text-xs text-fg-muted">
                Napomena: {pluralize(data.revenue.devicesWithoutPrice, PLURALS.uredaj)} nema
                definisanu cijenu servisa, pa je u procjeni korištena zamjenska cijena od 80 KM.{' '}
                <Link href="/app/uredaji" className="text-primary underline underline-offset-2">
                  Dopunite cijene
                </Link>{' '}
                za tačniju procjenu.
              </p>
            ) : null}
          </section>

          {/* Operativne metrike */}
          <section aria-labelledby="metrike-naslov" className="space-y-4">
            <h2 id="metrike-naslov" className="text-sm font-semibold text-fg">
              Rokovi i automatika
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Servisi u 30 dana"
                value={formatCount(data.metrics.dueIn30)}
                icon={CalendarClock}
                tone="primary"
                href="/app/uredaji?filter=30-dana"
              />
              <StatCard
                label="Servisi u 60 dana"
                value={formatCount(data.metrics.dueIn60)}
                icon={Clock}
                tone="neutral"
                href="/app/uredaji?filter=60-dana"
              />
              <StatCard
                label="Servisi koji kasne"
                value={formatCount(data.metrics.overdue)}
                icon={AlertTriangle}
                tone={data.metrics.overdue > 0 ? 'danger' : 'neutral'}
                href="/app/uredaji?filter=kasne"
              />
              <StatCard
                label="Podsjetnici (30 dana)"
                value={formatCount(data.metrics.remindersSent30d)}
                caption={
                  data.revenue.conversionRate !== null
                    ? `${formatPercent(data.revenue.conversionRate)} pretvoreno u rezervaciju`
                    : 'još nema poslanih podsjetnika'
                }
                icon={BellRing}
                tone="neutral"
                href="/app/podsjetnici"
                help="Broj stvarno poslanih podsjetnika u zadnjih 30 dana i udio koji je rezultirao rezervacijom."
              />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Redovi čekanja */}
            <Card>
              <CardHeaderRow
                title="Zahtijeva vašu pažnju"
                description="Stavke koje bez reakcije znače izgubljen servis ili nezadovoljnog kupca."
              />
              <CardBody className="pt-0">
                {data.queues.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CheckCircle2}
                    title="Sve je pod kontrolom"
                    description="Nema neuspjelih podsjetnika, nedodijeljenih rezervacija ni prijava bez odgovora."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.queues.map((queue) => (
                      <li key={queue.key}>
                        <Link
                          href={queue.href}
                          className="group flex items-start gap-4 py-3 transition-colors hover:bg-surface-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Badge
                            tone={queue.tone === 'danger' ? 'danger' : queue.tone === 'warning' ? 'warning' : 'info'}
                            size="lg"
                            className="tabular mt-0.5 min-w-9 justify-center"
                          >
                            {queue.count}
                          </Badge>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-fg">{queue.label}</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                              {queue.hint}
                            </span>
                          </span>
                          <ArrowRight
                            className="mt-1 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* Nadolazeći servisi */}
            <Card>
              <CardHeaderRow
                title="Sljedeći na redu"
                description="Uređaji kojima rok dolazi u narednih 30 dana."
                actions={
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/app/uredaji?filter=30-dana">Svi</Link>
                  </Button>
                }
              />
              <CardBody className="pt-0">
                {data.upcoming.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CalendarClock}
                    title="Nema servisa u narednih 30 dana"
                    description="Sljedeći rokovi su dalje u budućnosti."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.upcoming.map((item) => {
                      const due = evaluateServiceDue(item.nextServiceDate, data.today)
                      return (
                        <li key={item.id}>
                          <Link
                            href={`/app/uredaji/${item.id}`}
                            className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-fg">
                                {item.customerName}
                              </span>
                              <span className="block truncate text-xs text-fg-muted">
                                {item.deviceLabel}
                                {item.city ? ` · ${item.city}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span
                                className={cn(
                                  'tabular block text-sm font-medium',
                                  due.status === 'due_soon' || due.status === 'due_today'
                                    ? 'text-caution-strong'
                                    : 'text-fg',
                                )}
                              >
                                {formatDate(item.nextServiceDate)}
                              </span>
                              {item.priceKm ? (
                                <span className="tabular block text-xs text-fg-subtle">
                                  {formatCurrency(item.priceKm, { decimals: 0 })}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
