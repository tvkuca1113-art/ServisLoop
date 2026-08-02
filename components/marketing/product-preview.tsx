'use client'

import * as React from 'react'
import { AlertTriangle, CalendarDays, ClipboardList, LayoutDashboard, Wrench } from 'lucide-react'
import { Section, SectionIntro, DemoTag } from './section'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/disclosure'
import { Badge } from '@/components/ui/badge'
import {
  PREVIEW_BOOKINGS,
  PREVIEW_DEVICES,
  PREVIEW_METRICS,
  PREVIEW_QUEUES,
  PREVIEW_SERVICES,
  PREVIEW_WORK_ORDERS,
} from '@/lib/preview-data'
import { cn } from '@/lib/utils'

/**
 * Prikaz aplikacije sastavljen od stvarnih komponenti sistema, ali s
 * izmišljenim podacima i BEZ ijedne radnje koja mijenja stanje.
 *
 * Namjerno nema lažnih dugmadi: sve što se ovdje vidi je prikaz podataka.
 * Ništa ne obećava akciju koju ne može izvršiti.
 */
export function ProductPreview() {
  return (
    <Section tone="edge">
      <SectionIntro
        eyebrow="Pogled u aplikaciju"
        title="Ovako izgleda radni dan u ServisLoop-u"
        description="Ekrani ispod su stvarni prikazi sistema. Podaci su izmišljeni i služe samo za demonstraciju."
      />

      <div className="rounded-panel border-line bg-surface/60 shadow-float mt-10 overflow-hidden border">
        {/* Traka prozora */}
        <div className="border-line bg-surface-muted/40 flex items-center justify-between gap-4 border-b px-4 py-3">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="bg-critical/60 size-2.5 rounded-full" />
            <span className="bg-caution/60 size-2.5 rounded-full" />
            <span className="bg-positive/60 size-2.5 rounded-full" />
          </div>
          <p className="text-fg-subtle truncate font-mono text-[0.6875rem]">
            app.servisloop.ba / pregled
          </p>
          <DemoTag />
        </div>

        <Tabs defaultValue="pregled" className="p-4 sm:p-6">
          <TabsList variant="underline" className="w-full justify-start">
            <TabsTrigger value="pregled" variant="underline">
              <LayoutDashboard aria-hidden="true" />
              Pregled
            </TabsTrigger>
            <TabsTrigger value="uredaji" variant="underline">
              <Wrench aria-hidden="true" />
              Uređaji
            </TabsTrigger>
            <TabsTrigger value="servisi" variant="underline">
              <ClipboardList aria-hidden="true" />
              Servisi
            </TabsTrigger>
            <TabsTrigger value="rezervacije" variant="underline">
              <CalendarDays aria-hidden="true" />
              Rezervacije
            </TabsTrigger>
            <TabsTrigger value="nalozi" variant="underline">
              <AlertTriangle aria-hidden="true" />
              Radni nalozi
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pregled">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PREVIEW_METRICS.map((metric) => (
                <div key={metric.label} className="rounded-card border-line bg-surface border p-4">
                  <p className="text-fg-muted text-xs">{metric.label}</p>
                  <p className="tabular text-fg mt-2 text-2xl font-semibold">{metric.value}</p>
                  <p className="text-fg-subtle mt-1.5 text-[0.6875rem]">{metric.caption}</p>
                </div>
              ))}
            </div>

            <div className="rounded-card border-line bg-surface mt-4 border p-4">
              <h3 className="text-fg text-sm font-semibold">Zahtijeva vašu pažnju</h3>
              <ul className="divide-line mt-3 divide-y">
                {PREVIEW_QUEUES.map((queue) => (
                  <li key={queue.label} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="text-fg-muted text-sm">{queue.label}</span>
                    <Badge
                      tone={
                        queue.tone === 'danger'
                          ? 'danger'
                          : queue.tone === 'warning'
                            ? 'warning'
                            : 'info'
                      }
                      dot
                    >
                      {queue.count}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="uredaji">
            <PreviewTable
              caption="Lista uređaja s rokovima servisa"
              head={['Uređaj', 'Kupac', 'Model', 'Sljedeći servis', 'Status']}
              rows={PREVIEW_DEVICES.map((device) => [
                <span key="id" className="text-fg-subtle font-mono text-xs">
                  {device.id}
                </span>,
                <span key="customer">
                  <span className="text-fg block">{device.customer}</span>
                  <span className="text-fg-subtle block text-xs">{device.city}</span>
                </span>,
                <span key="model">
                  <span className="text-fg block">{device.model}</span>
                  <span className="text-fg-subtle block text-xs">{device.type}</span>
                </span>,
                <span key="next" className="tabular">
                  {device.nextService}
                </span>,
                <Badge
                  key="status"
                  dot
                  tone={
                    device.status === 'kasni'
                      ? 'danger'
                      : device.status === 'dospijeva'
                        ? 'warning'
                        : device.status === 'rezervisano'
                          ? 'info'
                          : 'success'
                  }
                >
                  {device.status}
                </Badge>,
              ])}
            />
          </TabsContent>

          <TabsContent value="servisi">
            <PreviewTable
              caption="Zadnji servisi"
              head={['Broj', 'Uređaj', 'Tehničar', 'Datum', 'Status']}
              rows={PREVIEW_SERVICES.map((service) => [
                <span key="id" className="text-fg-subtle font-mono text-xs">
                  {service.id}
                </span>,
                <span key="device">
                  <span className="text-fg block">{service.device}</span>
                  <span className="text-fg-subtle block text-xs">{service.customer}</span>
                </span>,
                <span key="tech">{service.technician}</span>,
                <span key="date" className="tabular">
                  {service.date}
                </span>,
                <Badge
                  key="status"
                  dot
                  tone={
                    service.result === 'završen'
                      ? 'success'
                      : service.result === 'čeka dio'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {service.result}
                </Badge>,
              ])}
            />
          </TabsContent>

          <TabsContent value="rezervacije">
            <PreviewTable
              caption="Rezervacije kupaca"
              head={['Broj', 'Kupac', 'Termin', 'Izvor', 'Status']}
              rows={PREVIEW_BOOKINGS.map((booking) => [
                <span key="id" className="text-fg-subtle font-mono text-xs">
                  {booking.id}
                </span>,
                <span key="customer">
                  <span className="text-fg block">{booking.customer}</span>
                  <span className="text-fg-subtle block text-xs">{booking.device}</span>
                </span>,
                <span key="slot" className="tabular">
                  {booking.slot}
                </span>,
                <Badge key="origin" tone="outline">
                  {booking.origin}
                </Badge>,
                <Badge key="state" dot tone={booking.state === 'potvrđeno' ? 'success' : 'warning'}>
                  {booking.state}
                </Badge>,
              ])}
            />
          </TabsContent>

          <TabsContent value="nalozi">
            <PreviewTable
              caption="Radni nalozi"
              head={['Broj', 'Nalog', 'Tehničar', 'Rok', 'Status']}
              rows={PREVIEW_WORK_ORDERS.map((order) => [
                <span key="id" className="text-fg-subtle font-mono text-xs">
                  {order.id}
                </span>,
                <span key="title">
                  <span className="text-fg block">{order.title}</span>
                  {order.priority === 'hitno' ? (
                    <Badge tone="danger" size="sm" className="mt-1">
                      hitno
                    </Badge>
                  ) : null}
                </span>,
                <span key="tech">{order.technician}</span>,
                <span key="due" className="tabular">
                  {order.due}
                </span>,
                <Badge
                  key="status"
                  dot
                  tone={
                    order.status === 'završen'
                      ? 'success'
                      : order.status === 'čeka dio'
                        ? 'warning'
                        : order.status === 'u toku'
                          ? 'info'
                          : 'neutral'
                  }
                >
                  {order.status}
                </Badge>,
              ])}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Section>
  )
}

function PreviewTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: string[]
  rows: React.ReactNode[][]
}) {
  return (
    <div className="scroll-slim rounded-card border-line bg-surface overflow-x-auto border">
      <table className="w-full min-w-[46rem] text-sm">
        <caption className="sr-only">{caption} — demo podaci</caption>
        <thead>
          <tr className="border-line border-b">
            {head.map((cell, index) => (
              <th
                key={cell}
                scope="col"
                className={cn(
                  'text-fg-subtle px-4 py-3 text-left text-xs font-semibold tracking-wide uppercase',
                  index === head.length - 1 && 'text-right',
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-surface-muted/40 transition-colors">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    'text-fg-muted px-4 py-3 align-top',
                    cellIndex === row.length - 1 && 'text-right',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
