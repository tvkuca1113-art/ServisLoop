import Link from 'next/link'
import { CalendarPlus, ScanLine, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Section, SectionIntro, DemoTag } from './section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { generateQrSvg, makeQrSvgResponsive } from '@/lib/qr/generate'
import { publicEnv } from '@/lib/env'
import { PREVIEW_PUBLIC_DEVICE } from '@/lib/preview-data'

/**
 * QR putovanje kupca.
 *
 * QR kod ispod je STVARAN i skeniranjem otvara demo stranicu uređaja.
 * Generiše se na serveru pri renderu — nije slika ni ukras.
 */
export async function QrJourneySection() {
  const demoUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/u/demo`
  const qrSvg = makeQrSvgResponsive(
    await generateQrSvg(demoUrl, { margin: 1, darkColor: '#07111F', lightColor: '#FFFFFF' }),
    'QR kod koji otvara demo stranicu uređaja',
  )

  const device = PREVIEW_PUBLIC_DEVICE

  return (
    <Section tone="raised">
      <SectionIntro
        eyebrow="Kupac bez naloga"
        title="Jedna naljepnica na uređaju zamjenjuje telefonski poziv"
        description="Tehničar zalijepi QR kod pri ugradnji. Kad kupcu nešto zatreba, skenira ga telefonom i odmah vidi svoj uređaj — bez registracije i bez instalacije aplikacije."
      />

      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        {/* Naljepnica */}
        <div className="mx-auto w-full max-w-xs">
          <div className="rounded-panel border border-line bg-white p-5 shadow-float">
            <div className="flex items-center justify-between gap-2 border-b border-ink-200 pb-3">
              <span className="text-[0.6875rem] font-bold tracking-wide text-ink-900 uppercase">
                {device.company}
              </span>
              <span className="font-mono text-[0.625rem] text-ink-500">UR-0987</span>
            </div>

            <div className="mx-auto mt-4 aspect-square w-full max-w-44">
              {/* eslint-disable-next-line react/no-danger */}
              <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            </div>

            <p className="mt-4 text-center text-[0.8125rem] leading-tight font-semibold text-ink-900">
              Skenirajte za servis i prijavu kvara
            </p>
            <p className="mt-1.5 text-center text-[0.6875rem] leading-snug text-ink-500">
              {device.type} · {device.manufacturer} {device.model}
            </p>
          </div>

          <p className="mt-4 text-center text-xs text-fg-subtle">
            Kod iznad je stvaran — skenirajte ga ili{' '}
            <Link href="/u/demo" className="text-primary underline underline-offset-2">
              otvorite demo stranicu
            </Link>
            .
          </p>
        </div>

        {/* Stranica koju kupac vidi */}
        <div className="overflow-hidden rounded-panel border border-line bg-surface/60">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-muted/40 px-4 py-3">
            <p className="truncate font-mono text-[0.6875rem] text-fg-subtle">
              servisloop.ba/u/••••••••
            </p>
            <DemoTag label="Primjer" />
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-fg-muted">{device.company}</p>
                <h3 className="mt-1 text-lg font-semibold text-fg">
                  {device.type} · {device.model}
                </h3>
                <p className="mt-1 font-mono text-xs text-fg-subtle">
                  Serijski: {device.maskedSerial}
                </p>
              </div>
              <Badge tone="success" dot>
                Garancija aktivna
              </Badge>
            </div>

            <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-4">
              {[
                { term: 'Ugrađeno', detail: device.installedAt },
                { term: 'Garancija do', detail: device.warrantyUntil },
                { term: 'Zadnji servis', detail: device.lastService },
                { term: 'Sljedeći servis', detail: device.nextService },
              ].map((item) => (
                <div key={item.term}>
                  <dt className="text-[0.6875rem] tracking-wide text-fg-subtle uppercase">
                    {item.term}
                  </dt>
                  <dd className="tabular mt-1 text-sm font-medium text-fg">{item.detail}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h4 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
                Historija servisa
              </h4>
              <ul className="mt-3 space-y-3">
                {device.history.map((entry) => (
                  <li key={entry.date} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-fg">
                        <span className="tabular font-medium">{entry.date}</span> · {entry.label}
                      </p>
                      <p className="text-xs text-fg-muted">{entry.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild block>
                <Link href="/u/demo/rezervisi">
                  <CalendarPlus className="size-4" aria-hidden="true" />
                  Rezerviši servis
                </Link>
              </Button>
              <Button asChild variant="secondary" block>
                <Link href="/u/demo/prijavi-kvar">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  Prijavi kvar
                </Link>
              </Button>
            </div>

            <p className="flex items-start gap-2 rounded-lg bg-surface-muted/50 p-3 text-xs leading-relaxed text-fg-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Kupac ne vidi vaše cijene, interne bilješke ni punu adresu. Serijski broj je
                maskiran. Stranica se može isključiti ili joj se može promijeniti token u
                svakom trenutku.
              </span>
            </p>
          </div>
        </div>
      </div>

      <ul className="mt-10 grid gap-6 sm:grid-cols-3">
        {[
          {
            icon: ScanLine,
            title: 'Skeniranje bez aplikacije',
            text: 'Kamera telefona otvara stranicu direktno. Nema preuzimanja ni naloga.',
          },
          {
            icon: CalendarPlus,
            title: 'Rezervacija u tri dodira',
            text: 'Kupac bira dan i termin iz stvarno slobodnih vremena vaše firme.',
          },
          {
            icon: TriangleAlert,
            title: 'Prijava kvara s fotografijom',
            text: 'Opis, kod greške i slike stižu direktno dispečeru, vezani za tačan uređaj.',
          },
        ].map((item) => (
          <li key={item.title} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <item.icon className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-fg">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">{item.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
