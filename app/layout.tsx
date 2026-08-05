import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ServisLoop — field service maintenance, on schedule',
    template: '%s · ServisLoop',
  },
  description:
    'Track every device you service, remind customers automatically, run checklists in the field and issue signed PDF service reports. Built for maintenance teams.',
  applicationName: 'ServisLoop',
  keywords: [
    'field service management',
    'preventive maintenance',
    'service reminders',
    'work orders',
    'QR device tracking',
  ],
  openGraph: {
    title: 'ServisLoop — field service maintenance, on schedule',
    description:
      'Never miss a service date again. QR-tagged devices, automatic reminders, technician checklists and signed PDF reports.',
    type: 'website',
    siteName: 'ServisLoop',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
