import * as React from 'react'

/**
 * Osnovni gradivni elementi e-poruka.
 *
 * Pisani ručno umjesto `@react-email/components` jer je taj paket na npm-u
 * označen kao nepodržan. Renderovanje i dalje radi `@react-email/render`
 * (održavan), a ovi elementi daju potpunu kontrolu nad HTML-om koji stiže
 * u Outlook, Gmail i domaće poštanske klijente.
 *
 * Pravila za e-poštu koja se ovdje poštuju:
 *   • raspored ide preko tabela, ne preko flexboxa ili grida;
 *   • stilovi su isključivo inline (mnogi klijenti brišu `<style>`);
 *   • širina je fiksna 600 px s postotnom rezervom za mobitel;
 *   • bez vanjskih fontova i bez JavaScripta;
 *   • svaka slika ima `alt` jer se slike često ne učitavaju.
 */

export const EMAIL_COLORS = {
  background: '#F1F5F9',
  surface: '#FFFFFF',
  brand: '#0A897D',
  brandSoft: '#EAFBF8',
  text: '#102033',
  muted: '#64748B',
  border: '#E2E8F0',
  danger: '#C0362F',
  warning: '#A16207',
} as const

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export function EmailLayout({
  preview,
  children,
  footer,
}: {
  /** Tekst koji poštanski klijent prikaže uz predmet u listi poruka. */
  preview: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <html lang="bs">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-apple-disable-message-reformatting" />
        <meta name="color-scheme" content="light" />
        <title>{preview}</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: EMAIL_COLORS.background,
          fontFamily: FONT_STACK,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* Skriveni pregled teksta u listi poruka. */}
        <div
          style={{
            display: 'none',
            overflow: 'hidden',
            lineHeight: '1px',
            opacity: 0,
            maxHeight: 0,
            maxWidth: 0,
          }}
        >
          {preview}
        </div>

        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ backgroundColor: EMAIL_COLORS.background, padding: '24px 12px' }}
        >
          <tbody>
            <tr>
              <td align="center">
                <table
                  role="presentation"
                  width="600"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    width: '100%',
                    maxWidth: '600px',
                    backgroundColor: EMAIL_COLORS.surface,
                    borderRadius: '12px',
                    border: `1px solid ${EMAIL_COLORS.border}`,
                    overflow: 'hidden',
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: '32px 32px 8px' }}>{children}</td>
                    </tr>
                    {footer ? (
                      <tr>
                        <td
                          style={{
                            padding: '20px 32px 28px',
                            borderTop: `1px solid ${EMAIL_COLORS.border}`,
                            backgroundColor: '#FAFBFD',
                          }}
                        >
                          {footer}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

export function EmailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1
      style={{
        margin: '0 0 16px',
        fontSize: '22px',
        lineHeight: '1.3',
        fontWeight: 600,
        color: EMAIL_COLORS.text,
        fontFamily: FONT_STACK,
      }}
    >
      {children}
    </h1>
  )
}

export function EmailText({
  children,
  muted = false,
  small = false,
}: {
  children: React.ReactNode
  muted?: boolean
  small?: boolean
}) {
  return (
    <p
      style={{
        margin: '0 0 16px',
        fontSize: small ? '13px' : '15px',
        lineHeight: '1.65',
        color: muted ? EMAIL_COLORS.muted : EMAIL_COLORS.text,
        fontFamily: FONT_STACK,
      }}
    >
      {children}
    </p>
  )
}

export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '8px 0 24px' }}>
      <tbody>
        <tr>
          <td
            align="center"
            style={{ backgroundColor: EMAIL_COLORS.brand, borderRadius: '8px' }}
          >
            <a
              href={href}
              style={{
                display: 'inline-block',
                padding: '13px 26px',
                fontSize: '15px',
                fontWeight: 600,
                color: '#FFFFFF',
                textDecoration: 'none',
                fontFamily: FONT_STACK,
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** Tabela podataka o uređaju/servisu. Koristi se u većini poruka. */
export function EmailDetails({
  rows,
}: {
  rows: Array<{ label: string; value: string | null | undefined }>
}) {
  const visible = rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== '')
  if (visible.length === 0) return null

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        margin: '0 0 24px',
        backgroundColor: EMAIL_COLORS.brandSoft,
        borderRadius: '8px',
        border: `1px solid ${EMAIL_COLORS.border}`,
      }}
    >
      <tbody>
        {visible.map((row, index) => (
          <tr key={row.label}>
            <td
              style={{
                padding: index === 0 ? '14px 16px 6px' : '6px 16px',
                fontSize: '13px',
                color: EMAIL_COLORS.muted,
                fontFamily: FONT_STACK,
                width: '45%',
                verticalAlign: 'top',
              }}
            >
              {row.label}
            </td>
            <td
              style={{
                padding: index === 0 ? '14px 16px 6px' : '6px 16px',
                fontSize: '14px',
                fontWeight: 600,
                color: EMAIL_COLORS.text,
                fontFamily: FONT_STACK,
                verticalAlign: 'top',
              }}
            >
              {row.value}
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={2} style={{ padding: '0 16px 12px' }} />
        </tr>
      </tbody>
    </table>
  )
}

/** Istaknuto upozorenje — koristi se za sigurnosne poruke. */
export function EmailNotice({
  children,
  tone = 'warning',
}: {
  children: React.ReactNode
  tone?: 'warning' | 'danger' | 'info'
}) {
  const color =
    tone === 'danger'
      ? EMAIL_COLORS.danger
      : tone === 'warning'
        ? EMAIL_COLORS.warning
        : EMAIL_COLORS.brand

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: '0 0 24px' }}
    >
      <tbody>
        <tr>
          <td
            style={{
              padding: '14px 16px',
              borderLeft: `3px solid ${color}`,
              backgroundColor: '#FFFBF5',
              borderRadius: '0 6px 6px 0',
              fontSize: '14px',
              lineHeight: '1.6',
              color: EMAIL_COLORS.text,
              fontFamily: FONT_STACK,
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export function EmailDivider() {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td
            style={{
              borderTop: `1px solid ${EMAIL_COLORS.border}`,
              fontSize: 0,
              lineHeight: 0,
              height: '1px',
              margin: '8px 0 24px',
            }}
          >
            &nbsp;
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export interface EmailBranding {
  companyName: string
  logoUrl?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

export function EmailHeader({ branding }: { branding: EmailBranding }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: '24px' }}>
      <tbody>
        <tr>
          <td>
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                height={36}
                style={{ maxHeight: '36px', width: 'auto', display: 'block', border: 0 }}
              />
            ) : (
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: EMAIL_COLORS.text,
                  fontFamily: FONT_STACK,
                }}
              >
                {branding.companyName}
              </span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export function EmailFooter({
  branding,
  unsubscribeUrl,
  unsubscribeLabel = 'Ne želim više podsjetnike za ovaj uređaj',
}: {
  branding: EmailBranding
  unsubscribeUrl?: string | null
  unsubscribeLabel?: string
}) {
  const contactLine = [branding.phone, branding.email].filter(Boolean).join(' · ')

  return (
    <div style={{ fontFamily: FONT_STACK }}>
      <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 600, color: EMAIL_COLORS.text }}>
        {branding.companyName}
      </p>
      {contactLine ? (
        <p style={{ margin: '0 0 4px', fontSize: '12px', color: EMAIL_COLORS.muted }}>
          {contactLine}
        </p>
      ) : null}
      {branding.address ? (
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: EMAIL_COLORS.muted }}>
          {branding.address}
        </p>
      ) : null}

      {unsubscribeUrl ? (
        <p style={{ margin: '12px 0 0', fontSize: '12px', color: EMAIL_COLORS.muted }}>
          <a href={unsubscribeUrl} style={{ color: EMAIL_COLORS.muted, textDecoration: 'underline' }}>
            {unsubscribeLabel}
          </a>
        </p>
      ) : null}

      <p style={{ margin: '12px 0 0', fontSize: '11px', color: '#94A3B8' }}>
        Poruku šalje ServisLoop u ime firme {branding.companyName}. Vaši podaci se koriste
        isključivo za organizaciju servisa vaše opreme.
      </p>
    </div>
  )
}
