'use client';

import { CircleAlert, CircleCheck, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useId, useState } from 'react';

import { FormAlert } from '@/components/app/forms/form-feedback';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { DEVICE_IMPORT_FIELDS, type ImportPreview } from '@/domain/import-mapping';
import { formatBytes } from '@/lib/utils';
import { commitImport, previewImport } from '@/server/actions/import';
import type { ActionResult } from '@/server/actions/result';
import type { ImportCommitSummary, ImportPreviewPayload } from '@/server/import/parse';

/**
 * The two-phase device import.
 *
 * Phase one parses and validates and writes nothing; phase two writes. The rule the whole
 * screen is built around is that a person should never find out what an import did *after*
 * it did it — so every problem the file has is on screen, per row and per cell, before the
 * commit button becomes pressable at all.
 *
 * One form, two submit buttons, an `intent` field telling them apart. That is deliberate:
 * the file input is never unmounted between the phases, so the browser still holds the
 * user's selection when they confirm and the server can re-read the same bytes. A second
 * form would need the file uploaded to a staging area first, which is a cache to expire,
 * secure and clean up in exchange for nothing.
 */

/** Issue tables are capped: 400 broken rows is a file to fix, not a list to read. */
const MAX_ISSUE_ROWS_SHOWN = 50;

export interface DeviceImportWizardProps {
  /** Server-side upload limits, passed in so the parser never reaches the browser bundle. */
  maxBytes: number;
  maxRows: number;
}

export function DeviceImportWizard(props: DeviceImportWizardProps) {
  // Remounting is the reset: `useActionState` has no other way to forget a finished run.
  const [runKey, setRunKey] = useState(0);

  return (
    <ImportRun
      key={runKey}
      {...props}
      onRestart={() => {
        setRunKey((current) => current + 1);
      }}
    />
  );
}

interface WizardState {
  preview: ActionResult<ImportPreviewPayload> | null;
  commit: ActionResult<ImportCommitSummary> | null;
}

const INITIAL_STATE: WizardState = { preview: null, commit: null };

function ImportRun({
  maxBytes,
  maxRows,
  onRestart,
}: DeviceImportWizardProps & { onRestart: () => void }) {
  const fileFieldId = useId();
  const [intent, setIntent] = useState<'preview' | 'commit'>('preview');

  const [state, formAction, pending] = useActionState<WizardState, FormData>(
    async (previous, formData) => {
      if (formData.get('intent') === 'commit') {
        const commit = await commitImport(formData);
        // A successful commit retires the preview: what is on screen afterwards is what
        // happened, not what was about to.
        return { preview: commit.ok ? null : previous.preview, commit };
      }
      return { preview: await previewImport(formData), commit: null };
    },
    INITIAL_STATE,
  );

  const previewPayload = state.preview?.ok ? state.preview.data : null;
  const committed = state.commit?.ok ? state.commit.data : null;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="intent" value={intent} />

      <Card>
        <CardHeader>
          <CardTitle as="h2">1. Choose the file</CardTitle>
          <CardDescription>
            CSV or Excel (.xlsx), up to {formatBytes(maxBytes)} and{' '}
            {maxRows.toLocaleString('en-GB')} rows. Nothing is saved until you confirm the
            preview.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fileFieldId} required>
              Spreadsheet
            </Label>
            <Input
              id={fileFieldId}
              name="file"
              type="file"
              required
              accept=".csv,.tsv,.txt,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="h-auto py-1.5"
              disabled={pending}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={pending}
              aria-busy={pending && intent === 'preview'}
              onClick={() => {
                setIntent('preview');
              }}
            >
              {pending && intent === 'preview' ? <Spinner size="sm" label="" /> : <Upload aria-hidden="true" />}
              {pending && intent === 'preview' ? 'Reading the file…' : 'Check the file'}
            </Button>

            {previewPayload || committed ? (
              <Button type="button" variant="ghost" onClick={onRestart} disabled={pending}>
                Start over
              </Button>
            ) : null}
          </div>

          {state.preview && !state.preview.ok ? <FormAlert result={state.preview} /> : null}
        </CardContent>
      </Card>

      {committed ? <CommitSummaryPanel summary={committed} onRestart={onRestart} /> : null}

      {state.commit && !state.commit.ok ? <FormAlert result={state.commit} /> : null}

      {previewPayload ? (
        <PreviewPanel
          payload={previewPayload}
          pending={pending}
          committing={pending && intent === 'commit'}
          onCommitIntent={() => {
            setIntent('commit');
          }}
        />
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

function PreviewPanel({
  payload,
  pending,
  committing,
  onCommitIntent,
}: {
  payload: ImportPreviewPayload;
  pending: boolean;
  committing: boolean;
  onCommitIntent: () => void;
}) {
  const { preview, headers, fileName, fileSize } = payload;
  const fieldByKey = new Map(DEVICE_IMPORT_FIELDS.map((f) => [f.key, f]));

  const errorRows = preview.rows.filter((row) => !row.ok);
  const warningRows = preview.rows.filter((row) => row.ok && row.warnings.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">2. Check the preview</CardTitle>
        <CardDescription>
          <span className="font-medium text-ink">{fileName}</span> · {formatBytes(fileSize)} ·{' '}
          {headers.length} columns. This is a dry run — nothing has been written.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tally label="Rows read" value={preview.totalRows} />
          <Tally label="Ready to import" value={preview.validRows} tone="ok" />
          <Tally label="With errors" value={preview.invalidRows} tone="error" />
          <Tally label="With warnings" value={preview.warningRows} tone="warn" />
          <Tally label="Blank rows skipped" value={preview.skippedBlankRows} />
        </dl>

        {preview.mapping.missingRequired.length > 0 ? (
          <Alert variant="destructive" icon={<CircleAlert />}>
            <AlertTitle>Required columns are missing</AlertTitle>
            <AlertDescription>
              <p>
                Nothing can be imported until this file has a column for each of these. Rename
                the heading in your spreadsheet and upload it again.
              </p>
              <ul className="list-inside list-disc pt-1">
                {preview.mapping.missingRequired.map((key) => (
                  <li key={key}>
                    <span className="font-medium text-ink">
                      {fieldByKey.get(key)?.label ?? key}
                    </span>{' '}
                    — accepted headings:{' '}
                    <span className="font-mono text-xs">
                      {(fieldByKey.get(key)?.aliases ?? []).slice(0, 6).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {preview.duplicateSerials.length > 0 ? (
          <Alert variant="warning" icon={<TriangleAlert />}>
            <AlertTitle>
              {preview.duplicateSerials.length}{' '}
              {preview.duplicateSerials.length === 1 ? 'serial number appears' : 'serial numbers appear'}{' '}
              more than once
            </AlertTitle>
            <AlertDescription>
              <p>
                Only the first row for each is imported — a repeated serial is the same physical
                device listed twice, and importing it twice would double the fleet.
              </p>
              <p className="pt-1 font-mono text-xs">
                {preview.duplicateSerials.slice(0, 12).join(', ')}
                {preview.duplicateSerials.length > 12
                  ? ` and ${preview.duplicateSerials.length - 12} more`
                  : ''}
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        <ColumnMappingTable preview={preview} headers={headers} />

        {errorRows.length > 0 ? (
          <IssueTable
            title={`${preview.invalidRows} ${preview.invalidRows === 1 ? 'row cannot' : 'rows cannot'} be imported`}
            description="Each of these has at least one cell that failed validation. They are skipped; the rest of the file still imports."
            rows={errorRows.slice(0, MAX_ISSUE_ROWS_SHOWN).map((row) => ({
              rowNumber: row.rowNumber,
              issues: row.errors,
            }))}
            hiddenCount={Math.max(0, errorRows.length - MAX_ISSUE_ROWS_SHOWN)}
            tone="error"
          />
        ) : null}

        {warningRows.length > 0 ? (
          <IssueTable
            title={`${warningRows.length} ${warningRows.length === 1 ? 'row needs' : 'rows need'} a second look`}
            description="These will import as read. Check the interpretation is what you meant — an ambiguous date is the usual cause."
            rows={warningRows.slice(0, MAX_ISSUE_ROWS_SHOWN).map((row) => ({
              rowNumber: row.rowNumber,
              issues: row.warnings,
            }))}
            hiddenCount={Math.max(0, warningRows.length - MAX_ISSUE_ROWS_SHOWN)}
            tone="warn"
          />
        ) : null}

        <Separator />

        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            {preview.canCommit
              ? `Confirming imports ${preview.validRows} ${preview.validRows === 1 ? 'device' : 'devices'}, creating any customer, site or device type they refer to that you do not already have. Due dates and reminders are generated immediately.`
              : 'This file cannot be imported yet. Fix the problems above and upload it again.'}
          </p>

          <div>
            <Button
              type="submit"
              disabled={!preview.canCommit || pending}
              aria-busy={committing}
              onClick={onCommitIntent}
            >
              {committing ? <Spinner size="sm" label="" /> : null}
              {committing
                ? 'Importing…'
                : `Import ${preview.validRows} ${preview.validRows === 1 ? 'device' : 'devices'}`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ColumnMappingTable({
  preview,
  headers,
}: {
  preview: ImportPreview;
  headers: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">Detected columns</h3>
      <p className="text-sm text-ink-muted">
        Headings are matched by name, ignoring case, spacing and diacritics, in English and
        in Bosnian, Croatian and Serbian.
      </p>

      <div className="rounded-card border border-border-base">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ServisLoop field</TableHead>
              <TableHead>Column in your file</TableHead>
              <TableHead>Required</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DEVICE_IMPORT_FIELDS.map((field) => {
              const index = preview.mapping.mapped[field.key];
              const matched = index === undefined ? null : (headers[index] ?? null);

              return (
                <TableRow key={field.key}>
                  <TableCell className="text-sm font-medium text-ink">{field.label}</TableCell>
                  <TableCell className="text-sm">
                    {matched === null ? (
                      <span className="text-ink-subtle">Not found</span>
                    ) : (
                      <span className="font-mono text-ink">{matched}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {field.required ? (
                      matched === null ? (
                        <Badge variant="overdue">Missing</Badge>
                      ) : (
                        <Badge variant="ok">Matched</Badge>
                      )
                    ) : (
                      <span className="text-sm text-ink-subtle">Optional</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {preview.mapping.unmatchedHeaders.length > 0 ? (
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">Ignored columns:</span>{' '}
          <span className="font-mono text-xs">
            {preview.mapping.unmatchedHeaders.map((h) => (h === '' ? '(unnamed)' : h)).join(', ')}
          </span>
          . These do not match any ServisLoop field and are left out — nothing is lost from
          your file.
        </p>
      ) : null}
    </div>
  );
}

interface IssueRow {
  rowNumber: number;
  issues: ReadonlyArray<{ field: string; label: string; message: string; rawValue: string | null }>;
}

function IssueTable({
  title,
  description,
  rows,
  hiddenCount,
  tone,
}: {
  title: string;
  description: string;
  rows: readonly IssueRow[];
  hiddenCount: number;
  tone: 'error' | 'warn';
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3
        className={
          tone === 'error'
            ? 'text-sm font-semibold text-state-overdue'
            : 'text-sm font-semibold text-ink'
        }
      >
        {title}
      </h3>
      <p className="text-sm text-ink-muted">{description}</p>

      <div className="rounded-card border border-border-base">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead numeric className="w-20">
                Row
              </TableHead>
              <TableHead>Column</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Problem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.flatMap((row) =>
              row.issues.map((issue) => (
                <TableRow key={`${row.rowNumber}-${issue.field}-${issue.message}`}>
                  <TableCell numeric className="text-ink-muted">
                    {row.rowNumber}
                  </TableCell>
                  <TableCell className="text-sm text-ink">{issue.label}</TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-xs text-ink-muted">
                    {issue.rawValue ?? '(blank)'}
                  </TableCell>
                  <TableCell className="text-sm text-ink-muted">{issue.message}</TableCell>
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </div>

      {hiddenCount > 0 ? (
        <p className="text-sm text-ink-subtle">
          {hiddenCount} more {hiddenCount === 1 ? 'row is' : 'rows are'} not shown. Fix these
          first and upload again — the same problem usually repeats.
        </p>
      ) : null}
    </div>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'error';
}) {
  const valueClass =
    tone === 'ok' && value > 0
      ? 'text-state-ok'
      : tone === 'warn' && value > 0
        ? 'text-state-soon'
        : tone === 'error' && value > 0
          ? 'text-state-overdue'
          : 'text-ink';

  return (
    <div className="flex flex-col gap-1 rounded-card border border-border-base bg-surface-muted p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`text-xl font-semibold ${valueClass}`}>{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

function CommitSummaryPanel({
  summary,
  onRestart,
}: {
  summary: ImportCommitSummary;
  onRestart: () => void;
}) {
  const skipped =
    summary.rowsSkippedInvalid + summary.rowsSkippedDuplicate + summary.rowsSkippedExisting;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Imported</CardTitle>
        <CardDescription>
          Every new device already has a next service date and its reminder ladder.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <Alert variant="success" icon={<CircleCheck />}>
          <AlertTitle>
            {summary.devicesCreated} {summary.devicesCreated === 1 ? 'device' : 'devices'} added
          </AlertTitle>
          <AlertDescription>
            Also created: {summary.customersCreated}{' '}
            {summary.customersCreated === 1 ? 'customer' : 'customers'}, {summary.locationsCreated}{' '}
            {summary.locationsCreated === 1 ? 'site' : 'sites'}, {summary.deviceTypesCreated}{' '}
            {summary.deviceTypesCreated === 1 ? 'device type' : 'device types'}.
          </AlertDescription>
        </Alert>

        {skipped > 0 ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <Tally label="Skipped — errors" value={summary.rowsSkippedInvalid} tone="error" />
            <Tally label="Skipped — already here" value={summary.rowsSkippedExisting} />
            <Tally label="Skipped — repeated serial" value={summary.rowsSkippedDuplicate} />
          </dl>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/app/devices">
              <FileSpreadsheet aria-hidden="true" />
              View the device register
            </Link>
          </Button>
          <Button type="button" variant="secondary" onClick={onRestart}>
            Import another file
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
