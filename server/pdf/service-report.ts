import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

import { scoreChecklist, describeScore, type ChecklistScore } from '@/domain/checklist';
import { formatCivilLong, type CivilDate } from '@/domain/dates';
import { describeInterval } from '@/domain/service-interval';
import type {
  ChecklistItem,
  ChecklistResult,
  Customer,
  Device,
  Location,
  Organization,
  Profile,
  ServiceReport,
  WorkOrder,
} from '@/domain/types';
import { formatReportNumber, KIND_LABELS, parseWorkOrderCode } from '@/domain/work-order';

/**
 * The signed service report.
 *
 * This is the document a customer keeps and an inspector asks for, so two properties are
 * treated as requirements rather than niceties:
 *
 * **1. It renders Bosnian.** The fourteen standard PDF fonts are Latin-1 only: they have
 * no glyphs for `č ć ž š đ`, and `pdf-lib` throws `WinAnsi cannot encode` the moment one
 * appears in a customer name. Since essentially every organisation, technician and site
 * name in this product's home market contains at least one of them, embedding a Unicode
 * font is not optional — it is the difference between a working report and a crash. The
 * DejaVu faces are vendored under `assets/fonts/` (PLAN.md R8) and read from disk here,
 * at request time, with no network fetch and no build-time inlining.
 *
 * **2. It is deterministic.** The same input produces byte-identical output. That means
 * no ambient clock — the timestamps come from the `ServiceReport` row, which is written
 * once and reused on every regeneration — and no ambient randomness. `pdf-lib` stamps a
 * creation and modification date at save time unless told otherwise, so both are set
 * explicitly. A report that changes bytes between two downloads cannot be checksummed,
 * cached or compared, and a customer who re-downloads last year's report must get last
 * year's report.
 *
 * Layout is a plain top-down cursor with an explicit page break: content is measured
 * before it is drawn, and a block that does not fit starts a new page. A long checklist
 * therefore continues onto page two rather than running off the bottom of page one.
 */

/* ------------------------------------------------------------------ */
/* Page geometry                                                       */
/* ------------------------------------------------------------------ */

/** A4 in PostScript points. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const MARGIN_X = 48;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 56;

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_BOTTOM = MARGIN_BOTTOM;

const FONT_DIR = 'assets/fonts';

/**
 * Ink colours.
 *
 * A PDF has no stylesheet and no design tokens — these are the printed equivalents of the
 * app's `ink` ramp, defined once here. Nothing in the document relies on colour to carry
 * meaning: every pass and fail is also spelled out in words, so the report reads the same
 * photocopied in black and white.
 */
const INK: RGB = rgb(0.09, 0.11, 0.15);
const INK_MUTED: RGB = rgb(0.42, 0.46, 0.53);
const RULE: RGB = rgb(0.85, 0.87, 0.9);
const BAND: RGB = rgb(0.96, 0.97, 0.98);
const FAIL: RGB = rgb(0.72, 0.16, 0.16);
const PASS: RGB = rgb(0.11, 0.42, 0.24);

const SIZE = {
  title: 20,
  heading: 11,
  body: 9.5,
  small: 8.5,
  footer: 8,
} as const;

const LINE = {
  body: 13,
  small: 11.5,
} as const;

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export interface ServiceReportInput {
  organization: Organization;
  workOrder: WorkOrder;
  device: Device;
  location: Location;
  customer: Customer;
  /** Who carried the work out. `null` when the assignee's profile has gone. */
  technician: Profile | null;
  /** The stored report row — supplies the number and the signature. */
  report: ServiceReport;
  /** The recorded run, snapshot-for-snapshot as it was saved at completion. */
  results: readonly ChecklistResult[];
  /**
   * The template items, used only to print units and tolerance bands beside a reading.
   * Optional, and never authoritative: the results carry their own label and kind
   * snapshots so a template edited since completion cannot rewrite this document.
   */
  items?: readonly ChecklistItem[];
  /** The date this completion produced, as computed by the scheduling service. */
  nextServiceDue: CivilDate | null;
  /** Interval in days, for the "how often" line. */
  intervalDays?: number | null;
}

/**
 * The report number for a job, derived from its code.
 *
 * `SR-YYYY-NNNN` shares the work order's own sequence, so the two references line up and
 * the number is a pure function of the code — stable no matter which code path opens the
 * report row first.
 */
export function serviceReportNumber(code: string): string {
  const parsed = parseWorkOrderCode(code);
  return parsed ? formatReportNumber(parsed.year, parsed.sequence) : code.replace('WO-', 'SR-');
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/**
 * Read the vendored faces from disk.
 *
 * Resolved against `process.cwd()` at request time rather than `import.meta.url`, because
 * the Next server bundle relocates route modules while the repository's `assets/` folder
 * is copied next to the running process.
 */
async function readFontBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(process.cwd(), FONT_DIR, file)));
}

async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);

  try {
    const [regular, bold] = await Promise.all([
      readFontBytes('DejaVuSans.ttf'),
      readFontBytes('DejaVuSans-Bold.ttf'),
    ]);

    // Subsetting takes the embed from ~930 KB to ~29 KB, and is deterministic: the glyph
    // set is a pure function of the text, so two renders of the same report — in the same
    // process or in different ones — produce identical bytes. Verified in the suite.
    return {
      regular: await doc.embedFont(regular, { subset: true }),
      bold: await doc.embedFont(bold, { subset: true }),
    };
  } catch (error) {
    // The standard faces cannot encode `č ć ž š đ`, so this is a genuinely degraded
    // report rather than an equivalent one. Failing loudly beats shipping a PDF with a
    // customer's name silently mangled.
    throw new Error(
      `Could not embed the report fonts from ${FONT_DIR}. The standard PDF fonts cannot render Bosnian diacritics, so the report cannot be produced without them. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Text layout                                                         */
/* ------------------------------------------------------------------ */

/**
 * Greedy word wrap against real glyph widths.
 *
 * A word longer than the column (a serial number, a URL) is broken by character rather
 * than allowed to overflow the margin.
 */
function wrapText(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = value.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
  const lines: string[] = [];

  for (const paragraph of clean.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w !== '');
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current !== '') lines.push(current);

      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }

      // Hard break an unbreakable token.
      let chunk = '';
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth && chunk !== '') {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
    }
    if (current !== '') lines.push(current);
  }

  return lines.length === 0 ? [''] : lines;
}

/* ------------------------------------------------------------------ */
/* The document cursor                                                 */
/* ------------------------------------------------------------------ */

/**
 * A top-down cursor over a growing list of pages.
 *
 * Every draw call goes through here so that "does this fit?" is asked in exactly one
 * place. `need(height)` breaks the page *before* a block is drawn, which is what keeps a
 * heading from being orphaned at the foot of a page from its first row.
 */
class Cursor {
  private readonly doc: PDFDocument;
  private readonly fonts: Fonts;
  readonly pages: PDFPage[] = [];
  private page: PDFPage;
  private y: number;

  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = this.newPage();
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(page);
    return page;
  }

  get current(): PDFPage {
    return this.page;
  }

  get top(): number {
    return this.y;
  }

  /** Guarantee `height` points of room, starting a new page if there is not. */
  need(height: number): void {
    if (this.y - height >= CONTENT_BOTTOM) return;
    this.page = this.newPage();
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  move(down: number): void {
    this.y -= down;
  }

  /** One line of text at the cursor, which then advances. */
  line(
    value: string,
    options: { x?: number; size?: number; bold?: boolean; color?: RGB; lineHeight?: number } = {},
  ): void {
    const size = options.size ?? SIZE.body;
    const lineHeight = options.lineHeight ?? LINE.body;
    this.need(lineHeight);
    this.page.drawText(value, {
      x: options.x ?? MARGIN_X,
      y: this.y - size,
      size,
      font: options.bold ? this.fonts.bold : this.fonts.regular,
      color: options.color ?? INK,
    });
    this.y -= lineHeight;
  }

  /**
   * Wrapped paragraph at the cursor.
   *
   * `keepTogether` reserves the whole block before drawing, so a short explanatory
   * paragraph moves to the next page intact rather than leaving one orphaned line behind
   * the page break.
   */
  paragraph(
    value: string,
    options: {
      x?: number;
      width?: number;
      size?: number;
      bold?: boolean;
      color?: RGB;
      lineHeight?: number;
      keepTogether?: boolean;
    } = {},
  ): void {
    const size = options.size ?? SIZE.body;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const width = options.width ?? CONTENT_WIDTH;
    const lines = wrapText(value, font, size, width);

    if (options.keepTogether === true) {
      this.need(lines.length * (options.lineHeight ?? LINE.body));
    }

    for (const line of lines) {
      this.line(line, {
        ...(options.x === undefined ? {} : { x: options.x }),
        size,
        ...(options.bold === undefined ? {} : { bold: options.bold }),
        ...(options.color === undefined ? {} : { color: options.color }),
        ...(options.lineHeight === undefined ? {} : { lineHeight: options.lineHeight }),
      });
    }
  }

  rule(color: RGB = RULE): void {
    this.need(8);
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: this.y },
      thickness: 0.75,
      color,
    });
    this.y -= 8;
  }

  /** A section heading, kept with at least `keepWith` points of what follows it. */
  heading(value: string, keepWith = 40): void {
    this.need(LINE.body + 14 + keepWith);
    this.move(6);
    this.line(value, { size: SIZE.heading, bold: true });
    this.rule();
  }

  band(height: number): void {
    this.page.drawRectangle({
      x: MARGIN_X,
      y: this.y - height,
      width: CONTENT_WIDTH,
      height,
      color: BAND,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Value formatting                                                    */
/* ------------------------------------------------------------------ */

function formatResultValue(
  result: ChecklistResult,
  item: ChecklistItem | undefined,
): string {
  switch (result.kindSnapshot) {
    case 'boolean':
      return result.valueBool === null ? 'Not recorded' : result.valueBool ? 'Yes' : 'No';
    case 'number': {
      if (result.valueNum === null) return 'Not recorded';
      const unit = item?.unit ? ` ${item.unit}` : '';
      return `${result.valueNum}${unit}`;
    }
    default:
      return result.valueText && result.valueText.trim() !== ''
        ? result.valueText
        : 'Not recorded';
  }
}

/** The tolerance band a numeric reading was judged against, when there is one. */
function describeTolerance(item: ChecklistItem | undefined): string | null {
  if (!item || item.kind !== 'number') return null;
  const unit = item.unit ? ` ${item.unit}` : '';
  if (item.minValue !== null && item.maxValue !== null) {
    return `Accepted range ${item.minValue}–${item.maxValue}${unit}`;
  }
  if (item.minValue !== null) return `Minimum ${item.minValue}${unit}`;
  if (item.maxValue !== null) return `Maximum ${item.maxValue}${unit}`;
  return null;
}

function fullName(profile: Profile | null): string {
  if (!profile) return 'Not recorded';
  return profile.fullName ?? profile.email;
}

function addressOf(location: Location): string {
  return [location.addressLine, [location.postalCode, location.city].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim() !== '')
    .join(', ');
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/**
 * Two columns of `label / value` pairs, laid out as a definition grid.
 *
 * The row is measured before it is drawn — the tallest cell sets the row height — so a
 * long address in the left column cannot overprint the value beside it.
 */
function drawPairs(
  cursor: Cursor,
  fonts: Fonts,
  pairs: ReadonlyArray<readonly [string, string]>,
  columns = 2,
): void {
  const columnWidth = (CONTENT_WIDTH - 16 * (columns - 1)) / columns;

  for (let i = 0; i < pairs.length; i += columns) {
    const row = pairs.slice(i, i + columns);
    const wrapped = row.map(([, value]) => wrapText(value, fonts.regular, SIZE.body, columnWidth));

    const rowHeight =
      LINE.small + Math.max(...wrapped.map((lines) => lines.length)) * LINE.body + 6;
    cursor.need(rowHeight);

    const top = cursor.top;
    row.forEach(([label], column) => {
      const x = MARGIN_X + column * (columnWidth + 16);
      cursor.current.drawText(label.toUpperCase(), {
        x,
        y: top - SIZE.small,
        size: SIZE.small,
        font: fonts.bold,
        color: INK_MUTED,
      });
      (wrapped[column] ?? []).forEach((line, index) => {
        cursor.current.drawText(line, {
          x,
          y: top - LINE.small - SIZE.body - index * LINE.body,
          size: SIZE.body,
          font: fonts.regular,
          color: INK,
        });
      });
    });

    cursor.move(rowHeight);
  }
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

/**
 * Render the report.
 *
 * Returns the raw PDF bytes. Pure with respect to its input: the only I/O is reading the
 * two font files, which never change.
 */
export async function renderServiceReport(input: ServiceReportInput): Promise<Uint8Array> {
  const {
    organization,
    workOrder,
    device,
    location,
    customer,
    technician,
    report,
    results,
    items = [],
    nextServiceDue,
    intervalDays,
  } = input;

  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const ordered = [...results].sort((a, b) => a.position - b.position);
  const score = scoreChecklist(ordered, items.length === 0 ? ordered.length : items.length);

  doc.setTitle(`${report.number} — ${workOrder.code}`);
  doc.setSubject(`Service report for ${device.name}`);
  doc.setAuthor(organization.name);
  doc.setCreator('ServisLoop');
  doc.setProducer('ServisLoop');
  // Determinism: without these, `pdf-lib` stamps `new Date()` into the trailer and two
  // renders of the same job would differ in bytes.
  const generatedAt = new Date(report.generatedAt);
  const stamp = Number.isNaN(generatedAt.getTime()) ? new Date(0) : generatedAt;
  doc.setCreationDate(stamp);
  doc.setModificationDate(stamp);

  const cursor = new Cursor(doc, fonts);

  /* -- header ------------------------------------------------------- */

  cursor.line(organization.name, { size: SIZE.title, bold: true, lineHeight: 26 });
  cursor.line('Service report', { size: SIZE.heading, color: INK_MUTED, lineHeight: 16 });
  cursor.move(4);

  const headerRight = (value: string, offsetY: number, bold = false): void => {
    const font = bold ? fonts.bold : fonts.regular;
    const width = font.widthOfTextAtSize(value, bold ? SIZE.heading : SIZE.body);
    cursor.current.drawText(value, {
      x: PAGE_WIDTH - MARGIN_X - width,
      y: PAGE_HEIGHT - MARGIN_TOP - offsetY,
      size: bold ? SIZE.heading : SIZE.body,
      font,
      color: bold ? INK : INK_MUTED,
    });
  };
  headerRight(report.number, SIZE.heading, true);
  headerRight(workOrder.code, SIZE.heading + 15);
  headerRight(KIND_LABELS[workOrder.kind], SIZE.heading + 28);

  cursor.rule(INK_MUTED);

  /* -- service details ---------------------------------------------- */

  cursor.heading('Service details');
  drawPairs(cursor, fonts, [
    ['Report number', report.number],
    ['Work order', workOrder.code],
    [
      'Date of service',
      workOrder.completedOn ? formatCivilLong(workOrder.completedOn) : 'Not recorded',
    ],
    ['Technician', fullName(technician)],
    ['Job type', KIND_LABELS[workOrder.kind]],
    [
      'Time on site',
      report.totalMinutes === null ? 'Not recorded' : `${report.totalMinutes} minutes`,
    ],
  ]);

  /* -- customer and site -------------------------------------------- */

  cursor.heading('Customer and site');
  drawPairs(cursor, fonts, [
    ['Customer', customer.name],
    ['Site', location.name],
    ['Contact', customer.contactName ?? 'Not recorded'],
    ['Address', addressOf(location) || 'Not recorded'],
    ['Telephone', customer.phone ?? 'Not recorded'],
    ['Email', customer.email ?? 'Not recorded'],
  ]);

  /* -- device -------------------------------------------------------- */

  cursor.heading('Device');
  drawPairs(cursor, fonts, [
    ['Device', device.name],
    ['Serial number', device.serialNumber ?? 'Not recorded'],
    ['Manufacturer', device.manufacturer ?? 'Not recorded'],
    ['Model', device.model ?? 'Not recorded'],
  ]);

  /* -- checklist ----------------------------------------------------- */

  cursor.heading('Service checklist');

  if (ordered.length === 0) {
    cursor.paragraph('No checklist was recorded against this job.', { color: INK_MUTED });
    cursor.move(4);
  } else {
    drawChecklistHeader(cursor, fonts);
    for (const result of ordered) {
      drawChecklistRow(cursor, fonts, result, itemById.get(result.itemId));
    }
  }

  /* -- summary ------------------------------------------------------- */

  cursor.move(6);
  drawSummary(cursor, fonts, score);

  /* -- next service -------------------------------------------------- */

  cursor.heading('Next service');
  drawPairs(cursor, fonts, [
    ['Next service due', nextServiceDue ? formatCivilLong(nextServiceDue) : 'Not scheduled'],
    [
      'Service interval',
      intervalDays ? describeInterval(intervalDays) : 'Not recorded',
    ],
  ]);
  cursor.paragraph(
    'The next service date is calculated from this visit and the device’s service interval. It moves automatically if the next visit is carried out early or late.',
    { size: SIZE.small, color: INK_MUTED, lineHeight: LINE.small, keepTogether: true },
  );

  /* -- signature ----------------------------------------------------- */

  drawSignature(cursor, fonts, report, customer);

  /* -- footers ------------------------------------------------------- */

  drawFooters(cursor.pages, fonts, report.number, workOrder.code);

  return doc.save({ useObjectStreams: false });
}

/* ------------------------------------------------------------------ */
/* Checklist table                                                     */
/* ------------------------------------------------------------------ */

const COL_CHECK_WIDTH = CONTENT_WIDTH * 0.52;
const COL_VALUE_WIDTH = CONTENT_WIDTH * 0.28;
const COL_RESULT_X = MARGIN_X + CONTENT_WIDTH * 0.84;

function drawChecklistHeader(cursor: Cursor, fonts: Fonts): void {
  cursor.need(LINE.small + 6);
  const top = cursor.top;
  const columns: ReadonlyArray<readonly [string, number]> = [
    ['Check', MARGIN_X],
    ['Recorded', MARGIN_X + COL_CHECK_WIDTH],
    ['Result', COL_RESULT_X],
  ];
  for (const [label, x] of columns) {
    cursor.current.drawText(label.toUpperCase(), {
      x,
      y: top - SIZE.small,
      size: SIZE.small,
      font: fonts.bold,
      color: INK_MUTED,
    });
  }
  cursor.move(LINE.small + 2);
  cursor.rule();
}

/**
 * One recorded check.
 *
 * The whole row — label, reading, verdict and note — is measured first and moved to the
 * next page as a unit, so a failed check is never separated from the note that explains
 * it. The header is redrawn when that happens.
 */
function drawChecklistRow(
  cursor: Cursor,
  fonts: Fonts,
  result: ChecklistResult,
  item: ChecklistItem | undefined,
): void {
  const labelLines = wrapText(result.labelSnapshot, fonts.regular, SIZE.body, COL_CHECK_WIDTH - 8);
  const valueLines = wrapText(
    formatResultValue(result, item),
    fonts.regular,
    SIZE.body,
    COL_VALUE_WIDTH - 8,
  );
  const tolerance = describeTolerance(item);
  const noteLines = result.note
    ? wrapText(`Note: ${result.note}`, fonts.regular, SIZE.small, CONTENT_WIDTH - 16)
    : [];

  const bodyLines = Math.max(labelLines.length, valueLines.length);
  const height =
    bodyLines * LINE.body +
    (tolerance ? LINE.small : 0) +
    noteLines.length * LINE.small +
    8;

  const pagesBefore = cursor.pages.length;
  cursor.need(height);
  if (cursor.pages.length > pagesBefore) drawChecklistHeader(cursor, fonts);

  const top = cursor.top;

  if (!result.passed) cursor.band(height);

  labelLines.forEach((line, index) => {
    cursor.current.drawText(line, {
      x: MARGIN_X + 4,
      y: top - SIZE.body - index * LINE.body - 2,
      size: SIZE.body,
      font: fonts.regular,
      color: INK,
    });
  });

  valueLines.forEach((line, index) => {
    cursor.current.drawText(line, {
      x: MARGIN_X + COL_CHECK_WIDTH,
      y: top - SIZE.body - index * LINE.body - 2,
      size: SIZE.body,
      font: fonts.regular,
      color: INK,
    });
  });

  // The verdict is a word, not a colour. The tint is a second signal, never the only one.
  cursor.current.drawText(result.passed ? 'Pass' : 'Fail', {
    x: COL_RESULT_X,
    y: top - SIZE.body - 2,
    size: SIZE.body,
    font: fonts.bold,
    color: result.passed ? PASS : FAIL,
  });

  let offset = bodyLines * LINE.body + 2;

  if (tolerance) {
    cursor.current.drawText(tolerance, {
      x: MARGIN_X + COL_CHECK_WIDTH,
      y: top - SIZE.small - offset,
      size: SIZE.small,
      font: fonts.regular,
      color: INK_MUTED,
    });
    offset += LINE.small;
  }

  noteLines.forEach((line, index) => {
    cursor.current.drawText(line, {
      x: MARGIN_X + 12,
      y: top - SIZE.small - offset - index * LINE.small,
      size: SIZE.small,
      font: fonts.regular,
      color: INK_MUTED,
    });
  });

  cursor.move(height);
  cursor.current.drawLine({
    start: { x: MARGIN_X, y: cursor.top + 2 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: cursor.top + 2 },
    thickness: 0.5,
    color: RULE,
  });
}

function drawSummary(cursor: Cursor, fonts: Fonts, score: ChecklistScore): void {
  const height = 46;
  cursor.need(height + 8);
  cursor.band(height);

  const top = cursor.top;
  cursor.current.drawText(describeScore(score), {
    x: MARGIN_X + 12,
    y: top - 20,
    size: SIZE.heading,
    font: fonts.bold,
    color: score.allPassed ? PASS : FAIL,
  });
  cursor.current.drawText(
    `${score.passed} passed · ${score.failed} failed · ${score.answered} of ${score.total} checks recorded · pass rate ${score.passRate}%`,
    {
      x: MARGIN_X + 12,
      y: top - 34,
      size: SIZE.small,
      font: fonts.regular,
      color: INK_MUTED,
    },
  );

  cursor.move(height + 8);
}

/* ------------------------------------------------------------------ */
/* Signature                                                           */
/* ------------------------------------------------------------------ */

function drawSignature(
  cursor: Cursor,
  fonts: Fonts,
  report: ServiceReport,
  customer: Customer,
): void {
  cursor.heading('Confirmation of work', 90);

  cursor.paragraph(
    'The customer’s representative named below confirms that the work described in this report was carried out on site.',
    { size: SIZE.small, color: INK_MUTED, lineHeight: LINE.small, keepTogether: true },
  );
  cursor.move(10);

  const boxHeight = 72;
  cursor.need(boxHeight + 8);
  const top = cursor.top;
  const half = (CONTENT_WIDTH - 20) / 2;

  cursor.current.drawRectangle({
    x: MARGIN_X,
    y: top - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: RULE,
    borderWidth: 0.75,
  });

  const label = (value: string, x: number): void => {
    cursor.current.drawText(value.toUpperCase(), {
      x,
      y: top - 18,
      size: SIZE.small,
      font: fonts.bold,
      color: INK_MUTED,
    });
  };

  label('Signed for the customer', MARGIN_X + 12);
  label('Signature', MARGIN_X + 20 + half);

  cursor.current.drawText(report.signedByName ?? customer.contactName ?? 'Not signed', {
    x: MARGIN_X + 12,
    y: top - 38,
    size: SIZE.body,
    font: fonts.bold,
    color: report.signedByName ? INK : INK_MUTED,
  });

  cursor.current.drawText(customer.name, {
    x: MARGIN_X + 12,
    y: top - 52,
    size: SIZE.small,
    font: fonts.regular,
    color: INK_MUTED,
  });

  cursor.current.drawLine({
    start: { x: MARGIN_X + 20 + half, y: top - 52 },
    end: { x: PAGE_WIDTH - MARGIN_X - 12, y: top - 52 },
    thickness: 0.75,
    color: RULE,
  });

  cursor.move(boxHeight + 8);
}

/* ------------------------------------------------------------------ */
/* Footers                                                             */
/* ------------------------------------------------------------------ */

/**
 * `Page n of m`, written after the fact.
 *
 * The total is only known once every section has been laid out, which is why the footer
 * is a second pass over the finished pages rather than something the cursor draws as it
 * goes.
 */
function drawFooters(
  pages: readonly PDFPage[],
  fonts: Fonts,
  reportNumber: string,
  workOrderCode: string,
): void {
  const total = pages.length;

  pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${total}`;
    const width = fonts.regular.widthOfTextAtSize(label, SIZE.footer);

    page.drawLine({
      start: { x: MARGIN_X, y: MARGIN_BOTTOM - 14 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: MARGIN_BOTTOM - 14 },
      thickness: 0.5,
      color: RULE,
    });

    page.drawText(`${reportNumber} · ${workOrderCode}`, {
      x: MARGIN_X,
      y: MARGIN_BOTTOM - 26,
      size: SIZE.footer,
      font: fonts.regular,
      color: INK_MUTED,
    });

    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN_X - width,
      y: MARGIN_BOTTOM - 26,
      size: SIZE.footer,
      font: fonts.regular,
      color: INK_MUTED,
    });
  });
}
