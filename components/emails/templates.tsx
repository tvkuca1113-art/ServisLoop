import * as React from 'react'
import {
  EmailButton,
  EmailDetails,
  EmailDivider,
  EmailFooter,
  EmailHeader,
  EmailHeading,
  EmailLayout,
  EmailNotice,
  EmailText,
  type EmailBranding,
} from './primitives'
import { formatCurrency, formatDate, formatDateLong, formatDateTime } from '@/lib/format'
import type { PlainDate } from '@/domains/shared/plain-date'

/**
 * Svi tekstovi e-poruka na jednom mjestu.
 *
 * Svaka poruka je tipizirana React komponenta. Time je nemoguće poslati
 * podsjetnik bez datuma servisa ili potvrdu rezervacije bez termina —
 * TypeScript to odbija prije nego što kod uopšte dođe do produkcije.
 *
 * Ton: pristojan, kratak, bez marketinga. Kupac je dobio poruku o svom
 * uređaju, ne reklamu.
 */

export const EMAIL_TEMPLATE_KEYS = [
  'service_reminder',
  'service_reminder_final',
  'service_overdue',
  'booking_confirmation',
  'booking_rescheduled',
  'booking_cancelled',
  'issue_report_confirmation',
  'work_order_assigned',
  'service_completed',
  'service_report_delivery',
  'team_invitation',
] as const

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number]

// ---------------------------------------------------------------------------
// Zajednički tipovi
// ---------------------------------------------------------------------------

export interface DeviceSummary {
  typeName: string
  manufacturer: string | null
  model: string | null
  installedAt: PlainDate | null
  locationLabel: string | null
}

function deviceTitle(device: DeviceSummary): string {
  return [device.typeName, [device.manufacturer, device.model].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ')
}

function greeting(customerName: string): string {
  const first = customerName.trim().split(/\s+/)[0] ?? customerName
  return `Poštovani/a ${first},`
}

// ---------------------------------------------------------------------------
// Podsjetnik na servis
// ---------------------------------------------------------------------------

export interface ServiceReminderProps {
  branding: EmailBranding
  customerName: string
  device: DeviceSummary
  dueDate: PlainDate
  daysUntilDue: number
  bookingUrl: string
  devicePageUrl: string | null
  unsubscribeUrl: string | null
  servicePriceKm: number | null
  /** `final` = zadnji podsjetnik prije roka, `overdue` = rok je prošao. */
  variant: 'standard' | 'final' | 'overdue'
}

export function ServiceReminderEmail(props: ServiceReminderProps) {
  const { branding, customerName, device, dueDate, daysUntilDue, variant } = props

  const heading =
    variant === 'overdue'
      ? 'Servis vašeg uređaja je istekao'
      : variant === 'final'
        ? `Servis dospijeva ${formatDate(dueDate)}`
        : 'Vrijeme je za redovni servis'

  const intro =
    variant === 'overdue'
      ? `rok za servis uređaja prošao je ${formatDateLong(dueDate)}. Redovno održavanje produžava vijek uređaja i smanjuje potrošnju.`
      : variant === 'final'
        ? `servis vašeg uređaja dospijeva za ${daysUntilDue} ${daysUntilDue === 1 ? 'dan' : 'dana'}, ${formatDateLong(dueDate)}.`
        : `servis vašeg uređaja dospijeva ${formatDateLong(dueDate)}. Termin možete odabrati sami, bez poziva.`

  return (
    <EmailLayout
      preview={`${heading} — ${deviceTitle(device)}`}
      footer={<EmailFooter branding={branding} unsubscribeUrl={props.unsubscribeUrl} />}
    >
      <EmailHeader branding={branding} />
      <EmailHeading>{heading}</EmailHeading>

      <EmailText>{greeting(customerName)}</EmailText>
      <EmailText>{intro}</EmailText>

      <EmailDetails
        rows={[
          { label: 'Uređaj', value: deviceTitle(device) },
          { label: 'Lokacija', value: device.locationLabel },
          { label: 'Ugrađeno', value: device.installedAt ? formatDate(device.installedAt) : null },
          { label: 'Rok servisa', value: formatDate(dueDate) },
          {
            label: 'Okvirna cijena',
            value: props.servicePriceKm
              ? formatCurrency(props.servicePriceKm, { decimals: 0 })
              : null,
          },
        ]}
      />

      <EmailButton href={props.bookingUrl}>Rezerviši termin servisa</EmailButton>

      <EmailText muted small>
        Klikom na dugme birate slobodan termin iz našeg kalendara. Nije potrebno otvarati nalog ni
        instalirati aplikaciju.
        {props.devicePageUrl ? (
          <>
            {' '}
            Podatke o uređaju i historiju servisa možete vidjeti{' '}
            <a href={props.devicePageUrl} style={{ color: '#0A897D' }}>
              ovdje
            </a>
            .
          </>
        ) : null}
      </EmailText>
    </EmailLayout>
  )
}

// ---------------------------------------------------------------------------
// Rezervacija
// ---------------------------------------------------------------------------

export interface BookingEmailProps {
  branding: EmailBranding
  customerName: string
  device: DeviceSummary | null
  bookingCode: string
  startsAt: string
  endsAt: string
  timeZone: string
  locationLabel: string | null
  manageUrl: string
  customerNote?: string | null
}

export function BookingConfirmationEmail(props: BookingEmailProps) {
  return (
    <EmailLayout
      preview={`Termin potvrđen — ${formatDateTime(props.startsAt, props.timeZone)}`}
      footer={<EmailFooter branding={props.branding} />}
    >
      <EmailHeader branding={props.branding} />
      <EmailHeading>Termin servisa je potvrđen</EmailHeading>

      <EmailText>{greeting(props.customerName)}</EmailText>
      <EmailText>zahvaljujemo na rezervaciji. Evo detalja vašeg termina:</EmailText>

      <EmailDetails
        rows={[
          { label: 'Broj rezervacije', value: props.bookingCode },
          { label: 'Datum i vrijeme', value: formatDateTime(props.startsAt, props.timeZone) },
          { label: 'Uređaj', value: props.device ? deviceTitle(props.device) : null },
          { label: 'Lokacija', value: props.locationLabel },
          { label: 'Vaša napomena', value: props.customerNote },
        ]}
      />

      <EmailButton href={props.manageUrl}>Pomjeri ili otkaži termin</EmailButton>

      <EmailText muted small>
        Ako vam termin ne odgovara, koristite dugme iznad. Link je vezan samo za vašu rezervaciju i
        ne dijelite ga s drugima.
      </EmailText>
    </EmailLayout>
  )
}

export function BookingRescheduledEmail(props: BookingEmailProps & { previousStartsAt: string }) {
  return (
    <EmailLayout
      preview={`Novi termin — ${formatDateTime(props.startsAt, props.timeZone)}`}
      footer={<EmailFooter branding={props.branding} />}
    >
      <EmailHeader branding={props.branding} />
      <EmailHeading>Termin servisa je pomjeren</EmailHeading>

      <EmailText>{greeting(props.customerName)}</EmailText>
      <EmailText>vaš termin je uspješno pomjeren.</EmailText>

      <EmailDetails
        rows={[
          { label: 'Broj rezervacije', value: props.bookingCode },
          {
            label: 'Prethodni termin',
            value: formatDateTime(props.previousStartsAt, props.timeZone),
          },
          { label: 'Novi termin', value: formatDateTime(props.startsAt, props.timeZone) },
          { label: 'Uređaj', value: props.device ? deviceTitle(props.device) : null },
        ]}
      />

      <EmailButton href={props.manageUrl}>Pregledaj termin</EmailButton>
    </EmailLayout>
  )
}

export function BookingCancelledEmail(
  props: Omit<BookingEmailProps, 'manageUrl'> & { reason: string | null; rebookUrl: string | null },
) {
  return (
    <EmailLayout
      preview="Termin servisa je otkazan"
      footer={<EmailFooter branding={props.branding} />}
    >
      <EmailHeader branding={props.branding} />
      <EmailHeading>Termin servisa je otkazan</EmailHeading>

      <EmailText>{greeting(props.customerName)}</EmailText>
      <EmailText>
        vaš termin {formatDateTime(props.startsAt, props.timeZone)} je otkazan.
        {props.reason ? ` Razlog: ${props.reason}` : ''}
      </EmailText>

      {props.rebookUrl ? (
        <>
          <EmailText>Novi termin možete odabrati kad vam odgovara:</EmailText>
          <EmailButton href={props.rebookUrl}>Odaberi novi termin</EmailButton>
        </>
      ) : null}
    </EmailLayout>
  )
}

// ---------------------------------------------------------------------------
// Prijava kvara
// ---------------------------------------------------------------------------

export interface IssueReportConfirmationProps {
  branding: EmailBranding
  customerName: string
  issueCode: string
  device: DeviceSummary | null
  category: string
  description: string
  isUrgent: boolean
  safetyRisk: boolean
  submittedAt: string
  timeZone: string
}

export function IssueReportConfirmationEmail(props: IssueReportConfirmationProps) {
  return (
    <EmailLayout
      preview={`Prijava kvara zaprimljena — ${props.issueCode}`}
      footer={<EmailFooter branding={props.branding} />}
    >
      <EmailHeader branding={props.branding} />
      <EmailHeading>Vaša prijava je zaprimljena</EmailHeading>

      <EmailText>{greeting(props.customerName)}</EmailText>
      <EmailText>
        zaprimili smo vašu prijavu kvara. Javit ćemo vam se radi dogovora o izlasku na teren.
      </EmailText>

      {props.safetyRisk ? (
        <EmailNotice tone="danger">
          <strong>Važno:</strong> označili ste da postoji dim, miris plina, gorenje ili curenje
          rashladnog sredstva. Prestanite koristiti uređaj, isključite ga s napajanja ako je
          bezbjedno, provjetrite prostoriju i odmah pozovite nadležnu službu (vatrogasci 123, hitna
          pomoć 124, plinska služba). Ne pokušavajte popravku sami.
        </EmailNotice>
      ) : null}

      <EmailDetails
        rows={[
          { label: 'Broj prijave', value: props.issueCode },
          { label: 'Uređaj', value: props.device ? deviceTitle(props.device) : null },
          { label: 'Vrsta problema', value: props.category },
          { label: 'Prijavljeno', value: formatDateTime(props.submittedAt, props.timeZone) },
          { label: 'Oznaka hitno', value: props.isUrgent ? 'da' : null },
        ]}
      />

      <EmailText muted small>
        Vaš opis: „{props.description.slice(0, 400)}
        {props.description.length > 400 ? '…' : ''}“
      </EmailText>

      <EmailDivider />

      <EmailText muted small>
        Oznaka „hitno“ pomaže nam u redoslijedu, ali ne garantuje izlazak istog dana. Za opasnost po
        život ili imovinu pozovite nadležne službe, ne čekajte naš odgovor.
      </EmailText>
    </EmailLayout>
  )
}

// ---------------------------------------------------------------------------
// Radni nalog i servis
// ---------------------------------------------------------------------------

export interface WorkOrderAssignedProps {
  branding: EmailBranding
  technicianName: string
  workOrderCode: string
  customerName: string
  device: DeviceSummary | null
  scheduledStart: string | null
  timeZone: string
  address: string | null
  priority: string
  workOrderUrl: string
}

export function WorkOrderAssignedEmail(props: WorkOrderAssignedProps) {
  return (
    <EmailLayout
      preview={`Novi radni nalog ${props.workOrderCode}`}
      footer={<EmailFooter branding={props.branding} />}
    >
      <EmailHeader branding={props.branding} />
      <EmailHeading>Dodijeljen vam je radni nalog</EmailHeading>

      <EmailText>{greeting(props.technicianName)}</EmailText>

      <EmailDetails
        rows={[
          { label: 'Broj naloga', value: props.workOrderCode },
          { label: 'Kupac', value: props.customerName },
          { label: 'Uređaj', value: props.device ? deviceTitle(props.device) : null },
          {
            label: 'Termin',
            value: props.scheduledStart
              ? formatDateTime(props.scheduledStart, props.timeZone)
              : 'nije zakazan',
          },
          { label: 'Adresa', value: props.address },
          { label: 'Prioritet', value: props.priority },
        ]}
      />

      <EmailButton href={props.workOrderUrl}>Otvori radni nalog</EmailButton>
    </EmailLayout>
  )
}

export interface ServiceCompletedProps {
  branding: EmailBranding
  customerName: string
  device: DeviceSummary
  serviceDate: PlainDate
  technicianName: string | null
  workPerformed: string | null
  recommendations: string | null
  nextServiceDate: PlainDate | null
  reportUrl: string | null
  totalKm: number | null
}

export function ServiceCompletedEmail(props: ServiceCompletedProps) {
  return (
    <EmailLayout
      preview={`Servis obavljen ${formatDate(props.serviceDate)}`}
      footer={<EmailFooter branding={props.branding} />}
    >
      <EmailHeader branding={props.branding} />
      <EmailHeading>Servis je obavljen</EmailHeading>

      <EmailText>{greeting(props.customerName)}</EmailText>
      <EmailText>
        servis vašeg uređaja je uspješno završen {formatDateLong(props.serviceDate)}. Hvala na
        povjerenju.
      </EmailText>

      <EmailDetails
        rows={[
          { label: 'Uređaj', value: deviceTitle(props.device) },
          { label: 'Datum servisa', value: formatDate(props.serviceDate) },
          { label: 'Tehničar', value: props.technicianName },
          {
            label: 'Ukupno',
            value: props.totalKm !== null ? formatCurrency(props.totalKm) : null,
          },
          {
            label: 'Sljedeći servis',
            value: props.nextServiceDate ? formatDate(props.nextServiceDate) : null,
          },
        ]}
      />

      {props.workPerformed ? (
        <>
          <EmailText>
            <strong>Izvršeni radovi</strong>
          </EmailText>
          <EmailText muted>{props.workPerformed}</EmailText>
        </>
      ) : null}

      {props.recommendations ? (
        <EmailNotice tone="info">
          <strong>Preporuka tehničara:</strong> {props.recommendations}
        </EmailNotice>
      ) : null}

      {props.reportUrl ? (
        <EmailButton href={props.reportUrl}>Preuzmi servisni izvještaj (PDF)</EmailButton>
      ) : null}

      {props.nextServiceDate ? (
        <EmailText muted small>
          Sljedeći servis je zabilježen za {formatDateLong(props.nextServiceDate)}. Podsjetit ćemo
          vas na vrijeme — ne morate pamtiti datum.
        </EmailText>
      ) : null}
    </EmailLayout>
  )
}

export interface ServiceReportDeliveryProps {
  branding: EmailBranding
  customerName: string
  reportNumber: string
  serviceDate: PlainDate
  device: DeviceSummary
  reportUrl: string
}

export function ServiceReportDeliveryEmail(props: ServiceReportDeliveryProps) {
  return (
    <EmailLayout
      preview={`Servisni izvještaj ${props.reportNumber}`}
      footer={<EmailFooter branding={props.branding} />}
    >
      <EmailHeader branding={props.branding} />
      <EmailHeading>Vaš servisni izvještaj</EmailHeading>

      <EmailText>{greeting(props.customerName)}</EmailText>
      <EmailText>u prilogu je izvještaj o obavljenom servisu.</EmailText>

      <EmailDetails
        rows={[
          { label: 'Broj izvještaja', value: props.reportNumber },
          { label: 'Datum servisa', value: formatDate(props.serviceDate) },
          { label: 'Uređaj', value: deviceTitle(props.device) },
        ]}
      />

      <EmailButton href={props.reportUrl}>Otvori izvještaj</EmailButton>

      <EmailText muted small>
        Link je privatan i vezan za ovaj izvještaj. Preporučujemo da ga sačuvate.
      </EmailText>
    </EmailLayout>
  )
}

// ---------------------------------------------------------------------------
// Pozivnica u tim
// ---------------------------------------------------------------------------

export interface TeamInvitationProps {
  branding: EmailBranding
  inviterName: string
  organizationName: string
  roleLabel: string
  acceptUrl: string
  expiresAt: string
  timeZone: string
}

export function TeamInvitationEmail(props: TeamInvitationProps) {
  return (
    <EmailLayout
      preview={`Poziv u ${props.organizationName} na ServisLoop`}
      footer={<EmailFooter branding={props.branding} />}
    >
      <EmailHeader branding={props.branding} />
      <EmailHeading>Pozvani ste u tim</EmailHeading>

      <EmailText>
        {props.inviterName} vas poziva da se pridružite firmi{' '}
        <strong>{props.organizationName}</strong> na ServisLoop-u, u ulozi{' '}
        <strong>{props.roleLabel}</strong>.
      </EmailText>

      <EmailButton href={props.acceptUrl}>Prihvati poziv</EmailButton>

      <EmailText muted small>
        Poziv vrijedi do {formatDateTime(props.expiresAt, props.timeZone)}. Ako niste očekivali ovu
        poruku, slobodno je zanemarite — bez klika na dugme ništa se ne dešava.
      </EmailText>
    </EmailLayout>
  )
}
