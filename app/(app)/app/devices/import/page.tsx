import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { DEVICE_IMPORT_FIELDS, MAX_IMPORT_ROWS } from '@/domain/import-mapping';
import { requirePermission } from '@/server/auth/context';
import { MAX_IMPORT_BYTES } from '@/server/import/parse';

import { DeviceImportWizard } from './import-wizard';

/**
 * Bulk device import.
 *
 * The reference table below is generated from `DEVICE_IMPORT_FIELDS` rather than written
 * out, so the documentation and the parser can never disagree about which headings are
 * accepted — adding an alias to the domain schema updates this page the same day.
 *
 * The upload limits come from the parser module, which is the thing that enforces them,
 * and are passed to the client component as props. Importing the parser into a client
 * component would drag ExcelJS into the browser bundle for the sake of two numbers.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Import devices',
  description: 'Upload a CSV or Excel equipment list, review a dry run, then commit it.',
};

export default async function ImportDevicesPage() {
  // The guard, not a courtesy: both actions re-check it, and this stops the page rendering
  // an upload control to someone who could never use it.
  await requirePermission('device:import');

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-3">
        <Link href="/app/devices">
          <ArrowLeft aria-hidden="true" />
          All devices
        </Link>
      </Button>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Import devices</h1>
        <p className="max-w-prose text-sm text-ink-muted">
          Upload the equipment list you already keep. ServisLoop reads it, shows you exactly
          what it found and what it could not, and writes nothing until you say so. Customers,
          sites and device types named in the file are created if they are not already here.
        </p>
      </header>

      <DeviceImportWizard maxBytes={MAX_IMPORT_BYTES} maxRows={MAX_IMPORT_ROWS} />

      <Card>
        <CardHeader>
          <CardTitle as="h2">Columns ServisLoop looks for</CardTitle>
          <CardDescription>
            Headings are matched ignoring case, spacing, punctuation and diacritics, so
            <span className="font-mono"> Serijski broj</span>,
            <span className="font-mono"> serial_number</span> and
            <span className="font-mono"> Serial Number </span>
            are the same column. Anything unrecognised is left out; your file is never
            modified.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Headings that match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEVICE_IMPORT_FIELDS.map((field) => (
                <TableRow key={field.key}>
                  <TableCell className="text-sm font-medium text-ink">{field.label}</TableCell>
                  <TableCell className="text-sm text-ink-muted">
                    {field.required ? 'Yes' : 'Optional'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-ink-muted">
                    {field.aliases.join(', ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">How values are read</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-medium text-ink">Dates</dt>
              <dd className="text-ink-muted">
                <span className="font-mono">2026-03-01</span>,
                <span className="font-mono"> 01.03.2026</span>,
                <span className="font-mono"> 01/03/2026</span> and real Excel date cells are all
                accepted. Slash and dot forms are read <strong>day first</strong>, so
                <span className="font-mono"> 03/04/2026</span> is 3 April. Anything that could be
                read either way is flagged as a warning in the preview so you can check it.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Numbers</dt>
              <dd className="text-ink-muted">
                Both conventions work — <span className="font-mono">1.234,56</span> and
                <span className="font-mono"> 1,234.56</span> are the same number. Whichever
                separator comes last is treated as the decimal point.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Blank rows</dt>
              <dd className="text-ink-muted">
                Skipped silently and counted in the preview. Spacer rows in the middle of a
                sheet are normal and do not stop an import.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Repeated serial numbers</dt>
              <dd className="text-ink-muted">
                A serial you already have is skipped, and a serial repeated within the file is
                imported once. Re-uploading the same export therefore adds nothing rather than
                doubling your register.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Size</dt>
              <dd className="text-ink-muted">
                Up to 5 MB and {MAX_IMPORT_ROWS.toLocaleString('en-GB')} rows per file. Only the
                first worksheet of a workbook is read.
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
