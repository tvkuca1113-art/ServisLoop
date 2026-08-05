/**
 * Upload parsing for the device import.
 *
 * One job: turn an uploaded file into `{ headers, rows }` of raw cell values. Nothing
 * here interprets a value — header matching, coercion and validation all live in
 * `@/domain/import-mapping`, which is pure and heavily tested. This module is the I/O
 * half: sniff the format, decode the bytes, hand back a rectangle.
 *
 * Two decisions worth stating, because they are what make the rest of the import safe:
 *
 * 1. **XLSX date cells stay `Date` objects.** Excel stores dates as serial numbers with a
 *    display format; stringifying them here would turn 1 March 2026 into `"3/1/2026"` or
 *    `"Sun Mar 01 2026 …"` and force `coerceDate` to guess day-first vs month-first on a
 *    value that was never ambiguous. Passing the real `Date` through means the domain
 *    takes its unambiguous branch.
 * 2. **Numbers stay numbers, text stays text.** A CSV cell `1.234,56` reaches the domain
 *    verbatim so `coerceNumber` can apply the European rule. We never pre-parse.
 *
 * Deliberately *not* marked `'server-only'`: this module touches no session, no cookies
 * and no database, and the parser tests import it directly under Vitest's Node
 * environment, where the `server-only` marker throws by design.
 */

import ExcelJS from 'exceljs';
import Papa from 'papaparse';

import type { ImportPreview } from '@/domain/import-mapping';
import { MAX_IMPORT_ROWS } from '@/domain/import-mapping';

/** Hard ceiling on upload size. Five megabytes is roughly 40 000 rows of device data. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * How far down a worksheet we are willing to look before giving up.
 *
 * A sheet whose *used range* runs past this is rejected without materialising it — the
 * point is to bound memory, not to be clever about which rows are real.
 */
export const MAX_SCANNED_ROWS = 50_000;

/** Columns beyond this are ignored: no device export has 256 meaningful columns. */
export const MAX_IMPORT_COLUMNS = 256;

export type UploadFormat = 'csv' | 'xlsx';

/**
 * A problem with the *file*, as opposed to a problem with a row.
 *
 * Carries copy written for the person who picked the file, because that is exactly what
 * the import screen shows them. `commitImport` and `previewImport` surface `.message`
 * verbatim rather than folding it into a generic failure.
 */
export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportParseError';
  }
}

export interface ParsedUpload {
  /** The header row, trimmed. Trailing empty columns are dropped. */
  headers: string[];
  /** Data rows, each padded or truncated to `headers.length`. */
  rows: unknown[][];
}

/**
 * What `previewImport` hands back to the client.
 *
 * Lives here rather than in `@/server/actions/import` because that module is `'use
 * server'`, and a `'use server'` file may only export async functions. The import screen
 * pulls this in with `import type`, so no parser code reaches the browser bundle.
 */
export interface ImportPreviewPayload {
  fileName: string;
  fileSize: number;
  /** The raw header row as it appeared in the file, for the mapping table. */
  headers: string[];
  preview: ImportPreview;
}

/** What `commitImport` hands back once rows have actually been written. */
export interface ImportCommitSummary {
  customersCreated: number;
  locationsCreated: number;
  deviceTypesCreated: number;
  devicesCreated: number;
  /** Rows that failed validation and were left untouched. */
  rowsSkippedInvalid: number;
  /** Later rows repeating a serial number already claimed earlier in the same file. */
  rowsSkippedDuplicate: number;
  /** Rows whose serial number already exists in this organisation. */
  rowsSkippedExisting: number;
}

/* ------------------------------------------------------------------ */
/* Format detection                                                    */
/* ------------------------------------------------------------------ */

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — every .xlsx is a zip
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .xls compound document

const TEXT_EXTENSIONS = ['.csv', '.tsv', '.txt'];
const WORKBOOK_EXTENSIONS = ['.xlsx', '.xlsm'];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, i) => bytes[i] === byte);
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

/**
 * Does this look like binary rubbish rather than delimited text?
 *
 * A NUL byte in the first few kilobytes is the giveaway. UTF-16 text trips this too,
 * which is intentional: we do not support it, and saying so beats emitting a table of
 * mojibake.
 */
function looksBinary(bytes: Uint8Array): boolean {
  const window = bytes.subarray(0, 8192);
  return window.includes(0);
}

/**
 * Decide the format from the bytes *and* the name, with the bytes winning.
 *
 * People rename files. A workbook saved as `devices.csv` still starts with `PK`, and
 * reading it as text would produce one nonsense row rather than an honest error.
 */
export function detectFormat(bytes: Uint8Array, fileName: string): UploadFormat {
  const extension = extensionOf(fileName);

  if (startsWith(bytes, ZIP_MAGIC)) return 'xlsx';

  if (startsWith(bytes, OLE_MAGIC)) {
    throw new ImportParseError(
      'That is a legacy Excel 97–2003 file (.xls). Open it in Excel and use “Save as” to produce an .xlsx or a CSV, then upload that.',
    );
  }

  if (WORKBOOK_EXTENSIONS.includes(extension)) {
    throw new ImportParseError(
      `“${fileName}” is named like an Excel workbook but its contents are not one. It may have been renamed, or the download may be incomplete.`,
    );
  }

  if (looksBinary(bytes)) {
    throw new ImportParseError(
      'That file is not a spreadsheet ServisLoop can read. Upload a CSV (.csv) or an Excel workbook (.xlsx).',
    );
  }

  if (TEXT_EXTENSIONS.includes(extension) || extension === '') return 'csv';

  throw new ImportParseError(
    `Files ending in “${extension}” are not supported. Upload a CSV (.csv) or an Excel workbook (.xlsx).`,
  );
}

/* ------------------------------------------------------------------ */
/* Shared row shaping                                                  */
/* ------------------------------------------------------------------ */

function isEmptyCell(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function rowIsEmpty(cells: readonly unknown[]): boolean {
  return cells.every(isEmptyCell);
}

/**
 * Drop trailing empty rows.
 *
 * Both sources produce them: a CSV ending in a newline yields one phantom row, and a
 * worksheet that has ever had formatting applied reports a used range far past the last
 * real value. Blank rows *between* data are kept — `buildImportPreview` counts those and
 * reports them as skipped, which is information the user wants.
 */
function trimTrailingEmptyRows(rows: unknown[][]): unknown[][] {
  let end = rows.length;
  while (end > 0 && rowIsEmpty(rows[end - 1] as unknown[])) end -= 1;
  return rows.slice(0, end);
}

/** Trailing unnamed columns are spreadsheet residue; interior blanks keep their slot. */
function trimTrailingEmptyHeaders(headers: string[]): string[] {
  let end = headers.length;
  while (end > 0 && (headers[end - 1] ?? '') === '') end -= 1;
  return headers.slice(0, end);
}

/** Force every row to the header's width so column indices always line up. */
function rectangularise(rows: unknown[][], width: number): unknown[][] {
  return rows.map((row) => {
    const out: unknown[] = new Array<unknown>(width).fill(null);
    for (let i = 0; i < width; i += 1) out[i] = row[i] ?? null;
    return out;
  });
}

function assertRowBudget(dataRowCount: number): void {
  if (dataRowCount > MAX_IMPORT_ROWS) {
    throw new ImportParseError(
      `That file has ${dataRowCount.toLocaleString('en-GB')} rows. ServisLoop imports at most ${MAX_IMPORT_ROWS.toLocaleString('en-GB')} at a time — split it and upload the parts.`,
    );
  }
}

/**
 * Turn a materialised grid into a {@link ParsedUpload}.
 *
 * Leading fully-blank rows are skipped so a file with a title row above the headers
 * still works; the first row with any content is taken as the header row.
 */
function toParsedUpload(grid: unknown[][]): ParsedUpload {
  const trimmed = trimTrailingEmptyRows(grid);

  const headerIndex = trimmed.findIndex((row) => !rowIsEmpty(row));
  if (headerIndex === -1) {
    throw new ImportParseError('That file has no rows in it. Check you uploaded the right one.');
  }

  const headerRow = trimmed[headerIndex] as unknown[];
  const headers = trimTrailingEmptyHeaders(
    headerRow
      .slice(0, MAX_IMPORT_COLUMNS)
      .map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim())),
  );

  if (headers.length === 0) {
    throw new ImportParseError(
      'The first row of that file is empty, so there are no column headings to match. Put the headings in the first row and upload it again.',
    );
  }

  const dataRows = trimmed.slice(headerIndex + 1);
  assertRowBudget(dataRows.length);

  return { headers, rows: rectangularise(dataRows, headers.length) };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Decode CSV bytes to text.
 *
 * UTF-8 first. When that yields replacement characters the file is almost certainly a
 * Windows-1250 export from a Central European Excel — the exact case that turns
 * "Držić d.o.o." into "Dr��i�" — so we decode again in that codepage rather than importing
 * corrupted customer names. The BOM is stripped either way: left in place it becomes part
 * of the first header and quietly breaks column detection.
 */
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');

  try {
    const fallback = new TextDecoder('windows-1250').decode(bytes);
    return fallback.replace(/^﻿/, '');
  } catch {
    // Node built without the full ICU data set. UTF-8 with replacements beats nothing.
    return utf8.replace(/^﻿/, '');
  }
}

function parseCsv(bytes: Uint8Array): ParsedUpload {
  const text = decodeText(bytes);

  // `header: false` keeps the raw rectangle: we do our own header handling, and papaparse's
  // object mode silently collapses duplicate column names. `dynamicTyping` stays off so
  // European decimals and dates reach the domain coercers as written.
  const result = Papa.parse<string[]>(text, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
  });

  if (result.data.length === 0) {
    throw new ImportParseError('That file has no rows in it. Check you uploaded the right one.');
  }

  if (result.data.length > MAX_SCANNED_ROWS) {
    throw new ImportParseError(
      `That file has more than ${MAX_SCANNED_ROWS.toLocaleString('en-GB')} lines, which is too large to preview. Split it and upload the parts.`,
    );
  }

  return toParsedUpload(result.data.map((row) => [...row]));
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

interface RichTextValue {
  richText: Array<{ text: string }>;
}
interface HyperlinkValue {
  text: string;
}
interface FormulaValue {
  result?: unknown;
}

function hasKey<K extends string>(value: object, key: K): value is Record<K, unknown> {
  return key in value;
}

/**
 * Flatten one ExcelJS cell to a primitive the domain can coerce.
 *
 * `Date` is passed through untouched — see the module comment. Formula cells contribute
 * their cached result, which is what the user sees in Excel. Error cells (`#N/A`,
 * `#REF!`) become blank so the row's own required-field rules decide whether that
 * matters, rather than the string "#N/A" being imported as a serial number.
 */
export function normalizeCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;

  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return value;

  if (kind === 'object') {
    const object = value as object;
    if (hasKey(object, 'richText')) {
      return (object as unknown as RichTextValue).richText.map((part) => part.text).join('');
    }
    if (hasKey(object, 'error')) return null;
    if (hasKey(object, 'formula') || hasKey(object, 'sharedFormula')) {
      return normalizeCellValue((object as unknown as FormulaValue).result ?? null);
    }
    if (hasKey(object, 'text')) return (object as unknown as HyperlinkValue).text;
    if (hasKey(object, 'hyperlink')) return null;
  }

  return String(value);
}

/**
 * ExcelJS ships `declare interface Buffer extends ArrayBuffer {}`, which does not line up
 * with the `Buffer` in `@types/node`. Its loader takes a Node Buffer at runtime — JSZip
 * does the actual reading — so the parameter type is borrowed from the method itself and
 * the mismatch is bridged in exactly one place instead of being papered over with `any`.
 */
type XlsxLoadInput = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

async function parseXlsx(bytes: Uint8Array): Promise<ParsedUpload> {
  const workbook = new ExcelJS.Workbook();

  try {
    // `Buffer.from` over the existing view is a no-copy wrap.
    const nodeBuffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    await workbook.xlsx.load(nodeBuffer as unknown as XlsxLoadInput);
  } catch {
    throw new ImportParseError(
      'That workbook could not be opened. It may be password-protected or only partly downloaded — try re-saving it from Excel.',
    );
  }

  // Only the first worksheet. An import that silently concatenated every tab would merge
  // a "Devices" sheet with a "Price list" sheet and call the result equipment.
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new ImportParseError('That workbook has no worksheets in it.');
  }

  if (sheet.rowCount > MAX_SCANNED_ROWS) {
    throw new ImportParseError(
      `The sheet “${sheet.name}” uses more than ${MAX_SCANNED_ROWS.toLocaleString('en-GB')} rows, which is too large to preview. Split it and upload the parts.`,
    );
  }

  const width = Math.min(Math.max(sheet.columnCount, 1), MAX_IMPORT_COLUMNS);
  const grid: unknown[][] = [];

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: unknown[] = new Array<unknown>(width).fill(null);
    for (let column = 1; column <= width; column += 1) {
      cells[column - 1] = normalizeCellValue(row.getCell(column).value);
    }
    grid.push(cells);
  }

  return toParsedUpload(grid);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse an uploaded CSV or XLSX into a header row and raw data rows.
 *
 * Throws {@link ImportParseError} — with a sentence the uploader can act on — for an
 * empty file, an oversized file, an unreadable format, or more rows than the importer
 * will accept. Every other failure mode is a row-level problem and is left to
 * `buildImportPreview`.
 */
export async function parseUpload(file: File): Promise<ParsedUpload> {
  if (file.size === 0) {
    throw new ImportParseError(
      `“${file.name}” is empty. Export the device list again and upload the new file.`,
    );
  }

  if (file.size > MAX_IMPORT_BYTES) {
    const megabytes = (file.size / (1024 * 1024)).toFixed(1);
    throw new ImportParseError(
      `“${file.name}” is ${megabytes} MB. The limit is 5 MB — split the file, or delete the columns you are not importing.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormat(bytes, file.name);

  return format === 'xlsx' ? parseXlsx(bytes) : parseCsv(bytes);
}
