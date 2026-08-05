/**
 * Spreadsheet import — header detection, value coercion, row validation.
 *
 * Real customer data arrives as an export from whatever the company used before: mixed
 * date formats, European decimal commas, diacritics in headers, blank rows in the middle.
 * This module turns that into either a clean typed row or a precise, per-cell error, so
 * the import UI can show a dry-run preview and write nothing until the user confirms.
 *
 * Pure module: no I/O, no ambient clock, no randomness.
 */

import { type CivilDate, fromEpochDay, fromParts, isCivilDate, tryCivilDate } from './dates';
import { MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS } from './service-interval';
import { DEVICE_STATUSES, type DeviceStatus } from './types';

/* ------------------------------------------------------------------ */
/* Header normalisation                                                */
/* ------------------------------------------------------------------ */

/**
 * Reduce a header cell to a comparison key.
 *
 * `"Serijski broj  "` → `serijski_broj`; `"Next Service Due"` → `next_service_due`.
 * Diacritics are stripped so `š`, `č`, `ć`, `ž`, `đ` match their ASCII forms.
 */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritical marks
    .replace(/đ/gi, 'd') // đ has no decomposition, so handle it explicitly
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type FieldType = 'string' | 'number' | 'integer' | 'date' | 'enum';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Alternative header spellings, already in normalised form. */
  aliases: readonly string[];
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  maxLength?: number;
}

/**
 * The device import schema.
 *
 * Aliases cover English and Bosnian/Croatian/Serbian headers, because that is what the
 * first customers will actually paste in.
 */
export const DEVICE_IMPORT_FIELDS: readonly FieldSpec[] = Object.freeze([
  {
    key: 'customerName',
    label: 'Customer',
    type: 'string',
    required: true,
    aliases: ['customer', 'customer_name', 'client', 'account', 'kupac', 'klijent', 'narucilac'],
    maxLength: 200,
  },
  {
    key: 'locationName',
    label: 'Location',
    type: 'string',
    required: true,
    aliases: ['location', 'location_name', 'site', 'building', 'lokacija', 'objekat', 'objekt'],
    maxLength: 200,
  },
  {
    key: 'address',
    label: 'Address',
    type: 'string',
    required: false,
    aliases: ['address', 'address_line', 'street', 'adresa', 'ulica'],
    maxLength: 300,
  },
  {
    key: 'city',
    label: 'City',
    type: 'string',
    required: false,
    aliases: ['city', 'town', 'grad', 'mjesto'],
    maxLength: 120,
  },
  {
    key: 'deviceName',
    label: 'Device',
    type: 'string',
    required: true,
    aliases: ['device', 'device_name', 'asset', 'equipment', 'uredaj', 'oprema', 'naziv_uredaja'],
    maxLength: 200,
  },
  {
    key: 'deviceType',
    label: 'Device type',
    type: 'string',
    required: false,
    aliases: ['device_type', 'type', 'category', 'tip', 'tip_uredaja', 'vrsta'],
    maxLength: 120,
  },
  {
    key: 'manufacturer',
    label: 'Manufacturer',
    type: 'string',
    required: false,
    aliases: ['manufacturer', 'brand', 'make', 'proizvodac', 'marka'],
    maxLength: 120,
  },
  {
    key: 'model',
    label: 'Model',
    type: 'string',
    required: false,
    aliases: ['model', 'model_no', 'model_number'],
    maxLength: 120,
  },
  {
    key: 'serialNumber',
    label: 'Serial number',
    type: 'string',
    required: false,
    aliases: ['serial', 'serial_number', 'serial_no', 'sn', 'serijski_broj', 'serijski'],
    maxLength: 120,
  },
  {
    key: 'installedOn',
    label: 'Installed on',
    type: 'date',
    required: false,
    aliases: [
      'installed_on',
      'installation_date',
      'installed',
      'commissioned',
      'datum_ugradnje',
      'datum_montaze',
    ],
  },
  {
    key: 'lastServiceAt',
    label: 'Last service',
    type: 'date',
    required: false,
    aliases: [
      'last_service',
      'last_service_at',
      'last_serviced',
      'last_maintenance',
      'zadnji_servis',
      'posljednji_servis',
    ],
  },
  {
    key: 'serviceIntervalDays',
    label: 'Service interval (days)',
    type: 'integer',
    required: false,
    aliases: [
      'interval',
      'service_interval',
      'service_interval_days',
      'interval_days',
      'interval_dana',
      'servisni_interval',
    ],
    min: MIN_INTERVAL_DAYS,
    max: MAX_INTERVAL_DAYS,
  },
  {
    key: 'status',
    label: 'Status',
    type: 'enum',
    required: false,
    aliases: ['status', 'state', 'stanje'],
    enumValues: DEVICE_STATUSES,
  },
  {
    key: 'notes',
    label: 'Notes',
    type: 'string',
    required: false,
    aliases: ['notes', 'note', 'comment', 'remarks', 'napomena', 'biljeska'],
    maxLength: 1000,
  },
]);

export interface ColumnMapping {
  /** field key → zero-based column index in the source file */
  mapped: Record<string, number>;
  /** Required fields with no matching column. */
  missingRequired: string[];
  /** Source headers that did not match any field. */
  unmatchedHeaders: string[];
}

/**
 * Match source headers to schema fields.
 *
 * Exact normalised match first, then alias match, then a conservative
 * "normalised header contains the field key" fallback. A source column is only ever
 * claimed by one field.
 */
export function detectColumns(
  headers: readonly string[],
  fields: readonly FieldSpec[] = DEVICE_IMPORT_FIELDS,
): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapped: Record<string, number> = {};
  const claimed = new Set<number>();

  const claim = (fieldKey: string, index: number): void => {
    mapped[fieldKey] = index;
    claimed.add(index);
  };

  // Pass 1 — exact key match.
  for (const field of fields) {
    const key = normalizeHeader(field.key);
    const idx = normalized.findIndex((h, i) => !claimed.has(i) && h === key);
    if (idx !== -1) claim(field.key, idx);
  }

  // Pass 2 — alias match.
  for (const field of fields) {
    if (field.key in mapped) continue;
    const idx = normalized.findIndex((h, i) => !claimed.has(i) && field.aliases.includes(h));
    if (idx !== -1) claim(field.key, idx);
  }

  // Pass 3 — substring fallback, longest header key first to avoid greedy mismatches.
  for (const field of fields) {
    if (field.key in mapped) continue;
    const key = normalizeHeader(field.key);
    const idx = normalized.findIndex(
      (h, i) => !claimed.has(i) && h.length >= 3 && (h.includes(key) || key.includes(h)),
    );
    if (idx !== -1) claim(field.key, idx);
  }

  return {
    mapped,
    missingRequired: fields.filter((f) => f.required && !(f.key in mapped)).map((f) => f.key),
    unmatchedHeaders: headers.filter((_, i) => !claimed.has(i)),
  };
}

/* ------------------------------------------------------------------ */
/* Value coercion                                                      */
/* ------------------------------------------------------------------ */

export function coerceString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Parse a number written in either European or Anglo convention.
 *
 * Handles `1.234,56`, `1,234.56`, `1234,56`, `1234.56`, `1 234,56` and bare integers.
 * The rule: whichever separator appears last is the decimal separator.
 */
export function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = coerceString(value);
  if (raw === null) return null;

  let s = raw.replace(/[\s '’]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // A single comma: decimal separator unless it looks like a thousands group.
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function coerceInteger(value: unknown): number | null {
  const n = coerceNumber(value);
  if (n === null) return null;
  return Number.isInteger(n) ? n : Math.round(n);
}

/**
 * Excel serial-date constants.
 *
 * Excel's day 0 is 1899-12-30 and the Unix epoch is serial 25569, so
 * `epochDay = serial − 25569`. That identity only holds from 1900-03-01 (serial 61)
 * onwards: Excel inherited a Lotus 1-2-3 bug and believes 1900 was a leap year, so
 * serials 1–60 are off by one against the real calendar and serial 60 is the
 * non-existent 1900-02-29.
 *
 * Rather than guess, anything below serial 61 is rejected. A `1` or `12` sitting in a
 * date column of an equipment export is overwhelmingly a stray number in the wrong
 * column, not January 1900 — and a wrong date silently imported is far worse than a row
 * flagged for the user to look at.
 */
const EXCEL_EPOCH_OFFSET = 25569;
const EXCEL_MIN_SERIAL = 61; // 1900-03-01
const EXCEL_MAX_SERIAL = 2_958_465; // 9999-12-31

const DATE_PATTERNS: Array<{ re: RegExp; order: 'dmy' | 'ymd' | 'mdy' }> = [
  { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: 'ymd' },
  { re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: 'ymd' },
  { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/, order: 'dmy' },
  { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: 'dmy' },
  { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: 'dmy' },
];

/**
 * Parse a date cell into a {@link CivilDate}.
 *
 * Accepts `YYYY-MM-DD`, `DD.MM.YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`, a `Date` object, and
 * an Excel serial number.
 *
 * Slash-separated dates are read as **day-first**, matching the European convention. A
 * value like `03/04/2026` is therefore 3 April, not 4 March — ambiguous by nature, so
 * {@link isAmbiguousDate} lets the import preview flag it for the user.
 */
export function coerceDate(value: unknown): CivilDate | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return fromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < EXCEL_MIN_SERIAL || value > EXCEL_MAX_SERIAL) return null;
    return fromEpochDay(Math.floor(value) - EXCEL_EPOCH_OFFSET);
  }

  const raw = coerceString(value);
  if (raw === null) return null;

  const direct = tryCivilDate(raw);
  if (direct) return direct;

  const cleaned = raw.replace(/\s+/g, '');

  for (const { re, order } of DATE_PATTERNS) {
    const m = re.exec(cleaned);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);

    let year: number;
    let month: number;
    let day: number;
    if (order === 'ymd') [year, month, day] = [a, b, c];
    else if (order === 'dmy') [day, month, year] = [a, b, c];
    else [month, day, year] = [a, b, c];

    const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isCivilDate(candidate)) return candidate;
  }

  return null;
}

/** True when a value could legitimately be read as either day-first or month-first. */
export function isAmbiguousDate(value: unknown): boolean {
  const raw = coerceString(value);
  if (raw === null) return false;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-]\d{4}\.?$/.exec(raw.replace(/\s+/g, ''));
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a >= 1 && a <= 12 && b >= 1 && b <= 12 && a !== b;
}

export function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const raw = coerceString(value);
  if (raw === null) return null;
  const s = raw.toLowerCase();
  if (['true', 'yes', 'y', '1', 'da', 'ok', 'pass'].includes(s)) return true;
  if (['false', 'no', 'n', '0', 'ne', 'fail'].includes(s)) return false;
  return null;
}

export function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  const raw = coerceString(value);
  if (raw === null) return null;
  const s = raw.toLowerCase().replace(/[\s-]+/g, '_');
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

/* ------------------------------------------------------------------ */
/* Row validation                                                      */
/* ------------------------------------------------------------------ */

export interface CellError {
  field: string;
  label: string;
  message: string;
  rawValue: string | null;
}

export interface ImportRowResult<T> {
  /** 1-based row number in the source file, header excluded. */
  rowNumber: number;
  ok: boolean;
  value: T | null;
  errors: CellError[];
  warnings: CellError[];
}

export interface DeviceImportRow {
  customerName: string;
  locationName: string;
  address: string | null;
  city: string | null;
  deviceName: string;
  deviceType: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  installedOn: CivilDate | null;
  lastServiceAt: CivilDate | null;
  serviceIntervalDays: number | null;
  status: DeviceStatus;
  notes: string | null;
}

/** True when every cell in the row is blank — a spacer row, skipped silently. */
export function isBlankRow(cells: readonly unknown[]): boolean {
  return cells.every((c) => coerceString(c) === null);
}

/**
 * Validate one source row against the schema.
 *
 * Collects *all* problems rather than stopping at the first, so a user fixing a 400-row
 * file sees every issue in one pass.
 */
export function validateImportRow(
  cells: readonly unknown[],
  mapping: ColumnMapping,
  rowNumber: number,
  fields: readonly FieldSpec[] = DEVICE_IMPORT_FIELDS,
): ImportRowResult<DeviceImportRow> {
  const errors: CellError[] = [];
  const warnings: CellError[] = [];
  const out: Record<string, unknown> = {};

  const cellFor = (key: string): unknown => {
    const idx = mapping.mapped[key];
    return idx === undefined ? null : cells[idx];
  };

  for (const field of fields) {
    const raw = cellFor(field.key);
    const rawString = coerceString(raw);

    const fail = (message: string): void => {
      errors.push({ field: field.key, label: field.label, message, rawValue: rawString });
    };

    if (rawString === null) {
      if (field.required) fail('Required value is missing.');
      out[field.key] = null;
      continue;
    }

    switch (field.type) {
      case 'string': {
        if (field.maxLength && rawString.length > field.maxLength) {
          fail(`Longer than ${field.maxLength} characters.`);
          break;
        }
        out[field.key] = rawString;
        break;
      }
      case 'number':
      case 'integer': {
        const n = field.type === 'integer' ? coerceInteger(raw) : coerceNumber(raw);
        if (n === null) {
          fail('Not a valid number.');
          break;
        }
        if (field.min !== undefined && n < field.min) {
          fail(`Must be at least ${field.min}.`);
          break;
        }
        if (field.max !== undefined && n > field.max) {
          fail(`Must be at most ${field.max}.`);
          break;
        }
        out[field.key] = n;
        break;
      }
      case 'date': {
        const d = coerceDate(raw);
        if (d === null) {
          fail('Not a recognised date. Use YYYY-MM-DD or DD.MM.YYYY.');
          break;
        }
        if (isAmbiguousDate(raw)) {
          warnings.push({
            field: field.key,
            label: field.label,
            message: `Read as ${d} (day first). Check this is what you meant.`,
            rawValue: rawString,
          });
        }
        out[field.key] = d;
        break;
      }
      case 'enum': {
        const v = coerceEnum(raw, field.enumValues ?? []);
        if (v === null) {
          fail(`Must be one of: ${(field.enumValues ?? []).join(', ')}.`);
          break;
        }
        out[field.key] = v;
        break;
      }
      default:
        out[field.key] = rawString;
    }
  }

  // Cross-field rule: you cannot have been serviced before you were installed.
  const installed = out.installedOn as CivilDate | null;
  const lastService = out.lastServiceAt as CivilDate | null;
  if (installed && lastService && lastService < installed) {
    errors.push({
      field: 'lastServiceAt',
      label: 'Last service',
      message: 'Last service date is before the installation date.',
      rawValue: lastService,
    });
  }

  if (errors.length > 0) {
    return { rowNumber, ok: false, value: null, errors, warnings };
  }

  const value: DeviceImportRow = {
    customerName: out.customerName as string,
    locationName: out.locationName as string,
    address: (out.address as string | null) ?? null,
    city: (out.city as string | null) ?? null,
    deviceName: out.deviceName as string,
    deviceType: (out.deviceType as string | null) ?? null,
    manufacturer: (out.manufacturer as string | null) ?? null,
    model: (out.model as string | null) ?? null,
    serialNumber: (out.serialNumber as string | null) ?? null,
    installedOn: (out.installedOn as CivilDate | null) ?? null,
    lastServiceAt: (out.lastServiceAt as CivilDate | null) ?? null,
    serviceIntervalDays: (out.serviceIntervalDays as number | null) ?? null,
    status: (out.status as DeviceStatus | null) ?? 'active',
    notes: (out.notes as string | null) ?? null,
  };

  return { rowNumber, ok: true, value, errors: [], warnings };
}

export interface ImportPreview {
  mapping: ColumnMapping;
  rows: ImportRowResult<DeviceImportRow>[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  skippedBlankRows: number;
  /** Duplicate serial numbers within the file itself. */
  duplicateSerials: string[];
  canCommit: boolean;
}

/** Cap on rows per upload, to bound memory and give the user a clear limit. */
export const MAX_IMPORT_ROWS = 5000;

/**
 * Build the dry-run preview.
 *
 * Nothing is written by this function. The UI shows the result, the user confirms, and
 * only then does the server persist the `validRows`.
 */
export function buildImportPreview(
  headers: readonly string[],
  dataRows: readonly (readonly unknown[])[],
  fields: readonly FieldSpec[] = DEVICE_IMPORT_FIELDS,
): ImportPreview {
  const mapping = detectColumns(headers, fields);
  const rows: ImportRowResult<DeviceImportRow>[] = [];
  let skippedBlankRows = 0;

  const limited = dataRows.slice(0, MAX_IMPORT_ROWS);

  limited.forEach((cells, i) => {
    if (isBlankRow(cells)) {
      skippedBlankRows += 1;
      return;
    }
    rows.push(validateImportRow(cells, mapping, i + 1, fields));
  });

  const serialCounts = new Map<string, number>();
  for (const r of rows) {
    const serial = r.value?.serialNumber;
    if (!serial) continue;
    const key = serial.toLowerCase();
    serialCounts.set(key, (serialCounts.get(key) ?? 0) + 1);
  }
  const duplicateSerials = [...serialCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([s]) => s)
    .sort();

  const validRows = rows.filter((r) => r.ok).length;

  return {
    mapping,
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    warningRows: rows.filter((r) => r.warnings.length > 0).length,
    skippedBlankRows,
    duplicateSerials,
    canCommit: mapping.missingRequired.length === 0 && validRows > 0,
  };
}
