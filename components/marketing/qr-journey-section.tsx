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
          <div className="rounded-panel border-line shadow-float border bg-white p-5">
            <div className="border-ink-200 flex items-center justify-between gap-2 border-b pb-3">
              <span className="text-ink-900 text-[0.6875rem] font-bold tracking-wide uppercase">
                {device.company}
              </span>
              <span className="text-ink-500 font-mono text-[0.625rem]">UR-0987</span>
            </div>

            <div className="mx-auto mt-4 aspect-square w-full max-w-44">
              <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            </div>

            <p className="text-ink-900 mt-4 text-center text-[0.8125rem] leading-tight font-semibold">
              Skenirajte za servis i prijavu kvara
            </p>
            <p className="text-ink-500 mt-1.5 text-center text-[0.6875rem] leading-snug">
              {device.type} · {device.manufacturer} {device.model}
            </p>
          </div>

          <p className="text-fg-subtle mt-4 text-center text-xs">
            Kod iznad je stvaran — skenirajte ga ili{' '}
            <Link href="/u/demo" className="text-primary underline underline-offset-2">
              otvorite demo stranicu
            </Link>
            .
          </p>
        </div>

        {/* Stranica koju kupac vidi */}
        <div className="rounded-panel border-line bg-surface/60 overflow-hidden border">
          <div className="border-line bg-surface-muted/40 flex items-center justify-between gap-3 border-b px-4 py-3">
            <p className="text-fg-subtle truncate font-mono text-[0.6875rem]">
              servisloop.ba/u/••••••••
            </p>
            <DemoTag label="Primjer" />
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-fg-muted text-xs">{device.company}</p>
                <h3 className="text-fg mt-1 text-lg font-semibold">
                  {device.type} · {device.model}
                </h3>
                <p className="text-fg-subtle mt-1 font-mono text-xs">
                  Serijski: {device.maskedSerial}
                </p>
              </div>
              <Badge tone="success" dot>
                Garancija aktivna
              </Badge>
            </div>

            <dl className="border-line grid grid-cols-2 gap-4 border-y py-4 sm:grid-cols-4">
              {[
                { term: 'Ugrađeno', detail: device.installedAt },
                { term: 'Garancija do', detail: device.warrantyUntil },
                { term: 'Zadnji servis', detail: device.lastService },
                { term: 'Sljedeći servis', detail: device.nextService },
              ].map((item) => (
                <div key={item.term}>
                  <dt className="text-fg-subtle text-[0.6875rem] tracking-wide uppercase">
                    {item.term}
                  </dt>
                  <dd className="tabular text-fg mt-1 text-sm font-medium">{item.detail}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h4 className="text-fg-subtle text-xs font-semibold tracking-wide uppercase">
                Historija servisa
              </h4>
              <ul className="mt-3 space-y-3">
                {device.history.map((entry) => (
                  <li key={entry.date} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
                    />
                    <div className="min-w-0">
                      <p className="text-fg text-sm">
                        <span className="tabular font-medium">{entry.date}</span> · {entry.label}
                      </p>
                      <p className="text-fg-muted text-xs">{entry.note}</p>
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

            <p className="bg-surface-muted/50 text-fg-muted flex items-start gap-2 rounded-lg p-3 text-xs leading-relaxed">
              <ShieldCheck className="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Kupac ne vidi vaše cijene, interne bilješke ni punu adresu. Serijski broj je
                maskiran. Stranica se može isključiti ili joj se može promijeniti token u svakom
                trenutku.
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
            <span className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <item.icon className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-fg text-sm font-semibold">{item.title}</h3>
              <p className="text-fg-muted mt-1 text-xs leading-relaxed">{item.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
