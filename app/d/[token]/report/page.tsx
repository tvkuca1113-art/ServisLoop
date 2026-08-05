import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui';
import { getRepository } from '@/server/data';

import { ReportForm } from './report-form';

/**
 * Public fault reporting — the other half of what a QR sticker is for.
 *
 * The person filling this in is usually not a customer contact and not a technician: a
 * caretaker, a kitchen manager, a night porter. So the form asks for what they can
 * actually answer — how bad it is, in plain words, and what they can see or hear — and
 * asks for nothing they would have to look up. The device, its site and the organisation
 * are all resolved from the token, so none of that has to be typed or guessed.
 *
 * Shows exactly what the device page shows and no more. A fault report is accepted from
 * anyone holding the token; it is triaged by staff before it becomes work.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Report a problem',
  description: 'Report a fault with this device.',
  robots: { index: false, follow: false },
};

export default async function ReportIssuePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const repo = getRepository();
  const context = await repo.getDeviceContextByToken(token);
  if (!context) notFound();

  const { device, location, organization } = context;

  return (
    <main id="main" className="min-h-dvh bg-surface-muted px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-3 w-fit">
            <Link href={`/d/${token}`}>
              <ArrowLeft aria-hidden="true" />
              Back to the device
            </Link>
          </Button>

          <header className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink-muted">{organization.name}</p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-ink">
              Report a problem
            </h1>
            <p className="text-sm text-ink-muted">
              {device.name} at {location.name}
              {device.serialNumber ? ` · ${device.serialNumber}` : ''}
            </p>
          </header>
        </div>

        <ReportForm
          token={token}
          deviceName={device.name}
          organizationName={organization.name}
          canBook={device.status !== 'retired'}
        />
      </div>
    </main>
  );
}
