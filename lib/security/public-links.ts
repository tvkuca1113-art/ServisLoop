import 'server-only'
import { publicEnv } from '@/lib/env'
import { DEMO_TOKEN } from './tokens'

/**
 * Sastavljanje javnih linkova koje kupac dobija.
 *
 * Sve na jednom mjestu da bi promjena putanje bila jedna izmjena, a ne
 * potraga po cijelom kodu. Svi linkovi su apsolutni jer završavaju u e-pošti
 * i u QR kodovima gdje relativna putanja ne znači ništa.
 */

function baseUrl(): string {
  return publicEnv.NEXT_PUBLIC_APP_URL
}

/** Javna stranica uređaja — odredište QR koda. */
export function devicePageUrl(qrToken: string): string {
  return `${baseUrl()}/u/${encodeURIComponent(qrToken)}`
}

/** Prijava kvara s javne stranice uređaja. */
export function issueReportUrl(qrToken: string): string {
  return `${baseUrl()}/u/${encodeURIComponent(qrToken)}/prijavi-kvar`
}

/** Rezervacija s javne stranice uređaja. */
export function deviceBookingUrl(qrToken: string): string {
  return `${baseUrl()}/u/${encodeURIComponent(qrToken)}/rezervisi`
}

/**
 * Rezervacija iz podsjetnika.
 * Token je vezan za uređaj i ima rok trajanja — nije isti kao QR token.
 */
export function bookingTokenUrl(bookingToken: string): string {
  return `${baseUrl()}/rezervacija/${encodeURIComponent(bookingToken)}`
}

/** Pregled i izmjena postojeće rezervacije. */
export function manageBookingUrl(bookingToken: string): string {
  return `${baseUrl()}/rezervacija/${encodeURIComponent(bookingToken)}`
}

/** Tokenizirani link ka PDF servisnom izvještaju. */
export function reportUrl(reportToken: string): string {
  return `${baseUrl()}/izvjestaj/${encodeURIComponent(reportToken)}`
}

/** Direktno preuzimanje PDF-a. */
export function reportDownloadUrl(reportToken: string): string {
  return `${baseUrl()}/izvjestaj/${encodeURIComponent(reportToken)}/pdf`
}

/**
 * Isključivanje podsjetnika za uređaj, jednim klikom iz poruke.
 * Koristi isti QR token — kupac koji ima link do stranice uređaja ionako
 * smije upravljati podsjetnicima za taj uređaj.
 */
export function unsubscribeUrl(qrToken: string): string {
  return `${baseUrl()}/u/${encodeURIComponent(qrToken)}/podsjetnici`
}

/** Prihvatanje pozivnice u tim. */
export function invitationUrl(invitationToken: string): string {
  return `${baseUrl()}/pozivnica/${encodeURIComponent(invitationToken)}`
}

/** Demo stranica uređaja — koristi se na marketing sajtu. */
export function demoDeviceUrl(): string {
  return devicePageUrl(DEMO_TOKEN)
}
