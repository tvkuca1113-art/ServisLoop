import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { buildImportPreview } from '@/domain/import-mapping';

import { ImportParseError, MAX_IMPORT_BYTES, normalizeCellValue, parseUpload } from '../parse';

/**
 * Parser tests against real bytes.
 *
 * Every fixture here is a genuine file: the CSV is encoded text, the workbook is produced
 * by ExcelJS and read back through the same code path a browser upload takes. Mocking the
 * file layer would prove nothing — the whole risk in this module is the boundary between
 * a spreadsheet's idea of a value and the domain's, and that boundary only exists in real
 * bytes.
 *
 * The recurring fixture is a Sarajevo lift-maintenance export: European dates
 * (`01.03.2026`), a decimal comma, diacritics, and a blank spacer row in the middle.
 */

function csvFile(contents: string, name = 'devices.csv'): File {
  return new File([Buffer.from(contents, 'utf8')], name, { type: 'text/csv' });
}

const CSV_FIXTURE = [
  'Kupac,Lokacija,Uređaj,Serijski broj,Datum ugradnje,Zadnji servis,Interval dana,Napomena',
  'Elektroprivreda BiH,Pogon Sarajevo,Dizalica A,SN-1001,01.03.2020,15.02.2026,365,Radi uredno',
  '',
  'Robot General Trading,Skladište Ilidža,Kompresor 7,SN-1002,2021-06-30,2026-01-05,180,"Pritisak 1.234,56 bar"',
].join('\n');

describe('parseUpload — CSV', () => {
  it('keeps headers, rows and blank spacer rows intact', async () => {
    const { headers, rows } = await parseUpload(csvFile(CSV_FIXTURE));

    expect(headers).toEqual([
      'Kupac',
      'Lokacija',
      'Uređaj',
      'Serijski broj',
      'Datum ugradnje',
      'Zadnji servis',
      'Interval dana',
      'Napomena',
    ]);

    // Three data rows: two devices with a spacer between them. The spacer survives so the
    // preview can report it as skipped rather than silently swallowing it.
    expect(rows).toHaveLength(3);
    expect(rows[0]?.[0]).toBe('Elektroprivreda BiH');
    expect(rows[1]?.every((cell) => cell === null || cell === '')).toBe(true);
    expect(rows[2]?.[3]).toBe('SN-1002');
  });

  it('passes a European date through as written, for the domain to interpret', async () => {
    const { rows } = await parseUpload(csvFile(CSV_FIXTURE));

    // Untouched by the parser: `01.03.2020` must still be the string, not a Date and not
    // a re-formatted `2020-01-03`.
    expect(rows[0]?.[4]).toBe('01.03.2020');
    expect(rows[0]?.[5]).toBe('15.02.2026');
  });

  it('preserves a decimal comma inside a quoted field', async () => {
    const { rows } = await parseUpload(csvFile(CSV_FIXTURE));
    expect(rows[2]?.[7]).toBe('Pritisak 1.234,56 bar');
  });

  it('survives the round trip into the domain preview with the dates read day-first', async () => {
    const { headers, rows } = await parseUpload(csvFile(CSV_FIXTURE));
    const preview = buildImportPreview(headers, rows);

    expect(preview.mapping.missingRequired).toEqual([]);
    expect(preview.skippedBlankRows).toBe(1);
    expect(preview.validRows).toBe(2);
    expect(preview.canCommit).toBe(true);
    expect(preview.rows[0]?.value?.installedOn).toBe('2020-03-01');
    expect(preview.rows[0]?.value?.lastServiceAt).toBe('2026-02-15');
    expect(preview.rows[1]?.value?.serviceIntervalDays).toBe(180);
  });

  it('auto-detects a semicolon delimiter, which is what a European Excel exports', async () => {
    const { headers, rows } = await parseUpload(
      csvFile('Kupac;Lokacija;Uređaj;Interval dana\nHotel Evropa;Recepcija;Klima 1;90\n'),
    );

    expect(headers).toEqual(['Kupac', 'Lokacija', 'Uređaj', 'Interval dana']);
    expect(rows).toEqual([['Hotel Evropa', 'Recepcija', 'Klima 1', '90']]);
  });

  it('strips a UTF-8 BOM so the first column heading still matches', async () => {
    const file = new File(
      [Buffer.from('﻿Customer,Location,Device\nAcme,Plant 1,Boiler\n', 'utf8')],
      'bom.csv',
      { type: 'text/csv' },
    );

    const { headers } = await parseUpload(file);
    expect(headers[0]).toBe('Customer');
  });

  it('treats a title row above the headings as prelude', async () => {
    const { headers, rows } = await parseUpload(
      csvFile(',,\nCustomer,Location,Device\nAcme,Plant 1,Boiler\n'),
    );

    expect(headers).toEqual(['Customer', 'Location', 'Device']);
    expect(rows).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */

async function xlsxFile(
  build: (sheet: ExcelJS.Worksheet, workbook: ExcelJS.Workbook) => void,
  name = 'devices.xlsx',
): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Uređaji');
  build(sheet, workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('parseUpload — XLSX', () => {
  it('reads headers and rows from the first worksheet only', async () => {
    const file = await xlsxFile((sheet, workbook) => {
      sheet.addRow(['Kupac', 'Lokacija', 'Uređaj', 'Serijski broj', 'Datum ugradnje']);
      sheet.addRow(['Elektroprivreda BiH', 'Pogon Sarajevo', 'Dizalica A', 'SN-1001', null]);

      // A second tab that must not leak into the import.
      const prices = workbook.addWorksheet('Cjenovnik');
      prices.addRow(['Artikal', 'Cijena']);
      prices.addRow(['Filter', 42]);
    });

    const { headers, rows } = await parseUpload(file);

    expect(headers).toEqual(['Kupac', 'Lokacija', 'Uređaj', 'Serijski broj', 'Datum ugradnje']);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[2]).toBe('Dizalica A');
    expect(rows.flat()).not.toContain('Filter');
  });

  it('hands a real date cell to the domain as a Date, not a locale string', async () => {
    const installed = new Date(Date.UTC(2020, 2, 1)); // 1 March 2020

    const file = await xlsxFile((sheet) => {
      sheet.addRow(['Customer', 'Location', 'Device', 'Installed on']);
      const row = sheet.addRow(['Acme', 'Plant 1', 'Boiler 3', installed]);
      row.getCell(4).numFmt = 'dd.mm.yyyy';
    });

    const { headers, rows } = await parseUpload(file);

    const cell = rows[0]?.[3];
    expect(cell).toBeInstanceOf(Date);

    // The important consequence: `coerceDate` takes its unambiguous `Date` branch, so a
    // European display format cannot flip day and month on the way in.
    const preview = buildImportPreview(headers, rows);
    expect(preview.rows[0]?.value?.installedOn).toBe('2020-03-01');
    expect(preview.rows[0]?.warnings).toEqual([]);
  });

  it('keeps a decimal number numeric and a European date string textual', async () => {
    const file = await xlsxFile((sheet) => {
      sheet.addRow(['Customer', 'Location', 'Device', 'Interval', 'Last service', 'Notes']);
      // Interval typed as a number; last service typed as text, the way a pasted column
      // arrives; a measurement written with a decimal comma in a free-text cell.
      sheet.addRow(['Acme', 'Plant 1', 'Boiler 3', 180, '15.02.2026', 'Pritisak 1.234,56 bar']);
    });

    const { headers, rows } = await parseUpload(file);

    expect(rows[0]?.[3]).toBe(180);
    expect(rows[0]?.[4]).toBe('15.02.2026');
    expect(rows[0]?.[5]).toBe('Pritisak 1.234,56 bar');

    const preview = buildImportPreview(headers, rows);
    expect(preview.rows[0]?.value?.serviceIntervalDays).toBe(180);
    expect(preview.rows[0]?.value?.lastServiceAt).toBe('2026-02-15');
  });

  it('flattens rich text and formula cells to their visible value', async () => {
    const file = await xlsxFile((sheet) => {
      sheet.addRow(['Customer', 'Location', 'Device', 'Interval']);
      const row = sheet.addRow(['Acme', 'Plant 1', null, null]);
      row.getCell(3).value = { richText: [{ text: 'Boiler ' }, { text: '3' }] };
      row.getCell(4).value = { formula: 'B2*2', result: 365, date1904: false };
    });

    const { rows } = await parseUpload(file);

    expect(rows[0]?.[2]).toBe('Boiler 3');
    expect(rows[0]?.[3]).toBe(365);
  });

  it('reads a workbook whose extension lies, because the bytes decide', async () => {
    const file = await xlsxFile((sheet) => {
      sheet.addRow(['Customer', 'Location', 'Device']);
      sheet.addRow(['Acme', 'Plant 1', 'Boiler 3']);
    }, 'renamed-export.csv');

    const { headers, rows } = await parseUpload(file);
    expect(headers).toEqual(['Customer', 'Location', 'Device']);
    expect(rows[0]?.[2]).toBe('Boiler 3');
  });
});

/* ------------------------------------------------------------------ */

describe('normalizeCellValue', () => {
  it('blanks Excel error values rather than importing "#N/A" as data', () => {
    expect(normalizeCellValue({ error: '#N/A' })).toBeNull();
  });

  it('takes the display text of a hyperlink cell', () => {
    expect(normalizeCellValue({ text: 'SN-1001', hyperlink: 'https://example.com' })).toBe(
      'SN-1001',
    );
  });

  it('passes primitives and Dates straight through', () => {
    const date = new Date(Date.UTC(2026, 0, 5));
    expect(normalizeCellValue(date)).toBe(date);
    expect(normalizeCellValue(180)).toBe(180);
    expect(normalizeCellValue('')).toBe('');
    expect(normalizeCellValue(undefined)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('parseUpload — guards', () => {
  it('rejects an empty file', async () => {
    await expect(parseUpload(csvFile(''))).rejects.toThrow(ImportParseError);
    await expect(parseUpload(csvFile(''))).rejects.toThrow(/is empty/i);
  });

  it('rejects a file over the 5 MB limit before reading it', async () => {
    const oversize = new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'huge.csv', {
      type: 'text/csv',
    });

    await expect(parseUpload(oversize)).rejects.toThrow(ImportParseError);
    await expect(parseUpload(oversize)).rejects.toThrow(/limit is 5 MB/);
  });

  it('rejects more rows than the importer will accept', async () => {
    const lines = ['Customer,Location,Device'];
    for (let i = 0; i < 5001; i += 1) lines.push(`Acme,Plant 1,Boiler ${i}`);

    await expect(parseUpload(csvFile(lines.join('\n')))).rejects.toThrow(/at most 5,000/);
  });

  it('rejects a legacy .xls workbook with instructions rather than gibberish', async () => {
    const ole = new Uint8Array(512);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const file = new File([ole], 'old-export.xls', { type: 'application/vnd.ms-excel' });

    await expect(parseUpload(file)).rejects.toThrow(/Excel 97–2003/);
  });

  it('rejects a binary file that is not a spreadsheet at all', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);
    const file = new File([png], 'photo.png', { type: 'image/png' });

    await expect(parseUpload(file)).rejects.toThrow(/not a spreadsheet/i);
  });

  it('rejects an unsupported extension by name', async () => {
    const file = new File([Buffer.from('{"devices":[]}', 'utf8')], 'devices.json', {
      type: 'application/json',
    });

    await expect(parseUpload(file)).rejects.toThrow(/\.json/);
  });

  it('rejects a file named .xlsx that is not a workbook', async () => {
    const file = new File([Buffer.from('Customer,Location,Device\n', 'utf8')], 'devices.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await expect(parseUpload(file)).rejects.toThrow(/named like an Excel workbook/);
  });

  it('rejects a file with headings but nothing under them only at the row level', async () => {
    // Headings alone are a legitimate upload — the preview reports "0 rows", it does not
    // throw. Throwing here would deny the user the column-mapping feedback they came for.
    const { headers, rows } = await parseUpload(csvFile('Customer,Location,Device\n'));
    expect(headers).toHaveLength(3);
    expect(rows).toEqual([]);

    const preview = buildImportPreview(headers, rows);
    expect(preview.canCommit).toBe(false);
  });
});
