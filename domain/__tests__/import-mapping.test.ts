import { describe, expect, it } from 'vitest';
import {
  buildImportPreview,
  coerceBoolean,
  coerceDate,
  coerceEnum,
  coerceInteger,
  coerceNumber,
  coerceString,
  detectColumns,
  isAmbiguousDate,
  isBlankRow,
  normalizeHeader,
  validateImportRow,
} from '../import-mapping';

describe('normalizeHeader', () => {
  it('lowercases, trims and collapses separators', () => {
    expect(normalizeHeader('  Serial Number ')).toBe('serial_number');
    expect(normalizeHeader('Next-Service/Due')).toBe('next_service_due');
    expect(normalizeHeader('Device   Name')).toBe('device_name');
  });

  it('strips South Slavic diacritics so local headers match', () => {
    expect(normalizeHeader('Serijski broj')).toBe('serijski_broj');
    expect(normalizeHeader('Proizvođač')).toBe('proizvodac');
    expect(normalizeHeader('Zadnji servis')).toBe('zadnji_servis');
    expect(normalizeHeader('Uređaj')).toBe('uredaj');
    expect(normalizeHeader('Bilješka')).toBe('biljeska');
  });

  it('handles empty and symbol-only headers', () => {
    expect(normalizeHeader('')).toBe('');
    expect(normalizeHeader('---')).toBe('');
  });
});

describe('detectColumns', () => {
  it('maps canonical English headers', () => {
    const mapping = detectColumns([
      'Customer',
      'Location',
      'Device',
      'Serial Number',
      'Service Interval Days',
    ]);
    expect(mapping.mapped.customerName).toBe(0);
    expect(mapping.mapped.locationName).toBe(1);
    expect(mapping.mapped.deviceName).toBe(2);
    expect(mapping.mapped.serialNumber).toBe(3);
    expect(mapping.mapped.serviceIntervalDays).toBe(4);
    expect(mapping.missingRequired).toEqual([]);
  });

  it('maps Bosnian headers', () => {
    const mapping = detectColumns([
      'Kupac',
      'Lokacija',
      'Uređaj',
      'Serijski broj',
      'Datum ugradnje',
      'Zadnji servis',
      'Interval dana',
    ]);
    expect(mapping.missingRequired).toEqual([]);
    expect(mapping.mapped.customerName).toBe(0);
    expect(mapping.mapped.deviceName).toBe(2);
    expect(mapping.mapped.installedOn).toBe(4);
    expect(mapping.mapped.lastServiceAt).toBe(5);
    expect(mapping.mapped.serviceIntervalDays).toBe(6);
  });

  it('reports missing required fields instead of guessing', () => {
    const mapping = detectColumns(['Serial', 'Model']);
    expect(mapping.missingRequired.sort()).toEqual(['customerName', 'deviceName', 'locationName']);
  });

  it('lists headers it could not place', () => {
    const mapping = detectColumns(['Customer', 'Location', 'Device', 'Invoice reference X9']);
    expect(mapping.unmatchedHeaders).toEqual(['Invoice reference X9']);
  });

  it('never assigns one source column to two fields', () => {
    const mapping = detectColumns(['Customer', 'Customer Name', 'Location', 'Device']);
    const indexes = Object.values(mapping.mapped);
    expect(new Set(indexes).size).toBe(indexes.length);
  });
});

describe('coerceString', () => {
  it('trims and treats blank as absent', () => {
    expect(coerceString('  hello  ')).toBe('hello');
    expect(coerceString('   ')).toBeNull();
    expect(coerceString('')).toBeNull();
    expect(coerceString(null)).toBeNull();
    expect(coerceString(undefined)).toBeNull();
    expect(coerceString(42)).toBe('42');
  });
});

describe('coerceNumber', () => {
  it('reads Anglo formatting', () => {
    expect(coerceNumber('1234.56')).toBe(1234.56);
    expect(coerceNumber('1,234.56')).toBe(1234.56);
    expect(coerceNumber('1,234,567.89')).toBe(1234567.89);
  });

  it('reads European formatting', () => {
    expect(coerceNumber('1234,56')).toBe(1234.56);
    expect(coerceNumber('1.234,56')).toBe(1234.56);
    expect(coerceNumber('1.234.567,89')).toBe(1234567.89);
  });

  it('reads space- and apostrophe-grouped numbers', () => {
    expect(coerceNumber('1 234,56')).toBe(1234.56);
    expect(coerceNumber("1'234.56")).toBe(1234.56);
  });

  it('handles plain integers and negatives', () => {
    expect(coerceNumber('365')).toBe(365);
    expect(coerceNumber(365)).toBe(365);
    expect(coerceNumber('-12.5')).toBe(-12.5);
  });

  it('distinguishes a thousands comma from a decimal comma', () => {
    expect(coerceNumber('1,234')).toBe(1234); // grouped
    expect(coerceNumber('1,23')).toBe(1.23); // decimal
  });

  it('returns null for junk', () => {
    expect(coerceNumber('abc')).toBeNull();
    expect(coerceNumber('')).toBeNull();
    expect(coerceNumber(null)).toBeNull();
    expect(coerceNumber(Number.NaN)).toBeNull();
  });
});

describe('coerceInteger', () => {
  it('rounds a fractional value', () => {
    expect(coerceInteger('365')).toBe(365);
    expect(coerceInteger('364.6')).toBe(365);
    expect(coerceInteger('junk')).toBeNull();
  });
});

describe('coerceDate', () => {
  it('accepts ISO dates', () => {
    expect(coerceDate('2026-08-02')).toBe('2026-08-02');
    expect(coerceDate('2026/8/2')).toBe('2026-08-02');
  });

  it('accepts European day-first formats', () => {
    expect(coerceDate('02.08.2026')).toBe('2026-08-02');
    expect(coerceDate('2.8.2026')).toBe('2026-08-02');
    expect(coerceDate('02.08.2026.')).toBe('2026-08-02'); // trailing dot is common locally
    expect(coerceDate('02-08-2026')).toBe('2026-08-02');
    expect(coerceDate('02/08/2026')).toBe('2026-08-02');
  });

  it('accepts a Date object and an Excel serial number', () => {
    expect(coerceDate(new Date('2026-08-02T12:00:00Z'))).toBe('2026-08-02');
    expect(coerceDate(45000)).toBe('2023-03-15');
    expect(coerceDate(46236)).toBe('2026-08-02');
    expect(coerceDate(61)).toBe('1900-03-01'); // first serial the offset is exact for
  });

  it('rejects Excel serials inside the 1900 leap-year bug window', () => {
    // Serials 1–60 are off by one against the real calendar, and a bare `1` or `12` in a
    // date column is almost always a stray value rather than January 1900.
    expect(coerceDate(1)).toBeNull();
    expect(coerceDate(60)).toBeNull();
    expect(coerceDate(0)).toBeNull();
    expect(coerceDate(-5)).toBeNull();
  });

  it('rejects impossible and unparseable values', () => {
    expect(coerceDate('2026-02-30')).toBeNull();
    expect(coerceDate('32.01.2026')).toBeNull();
    expect(coerceDate('sometime in August')).toBeNull();
    expect(coerceDate('')).toBeNull();
    expect(coerceDate(null)).toBeNull();
    expect(coerceDate(new Date('nope'))).toBeNull();
  });
});

describe('isAmbiguousDate', () => {
  it('flags values readable as either day-first or month-first', () => {
    expect(isAmbiguousDate('03/04/2026')).toBe(true);
    expect(isAmbiguousDate('03.04.2026')).toBe(true);
  });

  it('does not flag unambiguous values', () => {
    expect(isAmbiguousDate('23/04/2026')).toBe(false); // 23 cannot be a month
    expect(isAmbiguousDate('04/04/2026')).toBe(false); // identical either way
    expect(isAmbiguousDate('2026-04-03')).toBe(false);
  });
});

describe('coerceBoolean and coerceEnum', () => {
  it('reads English and local truthy words', () => {
    expect(coerceBoolean('yes')).toBe(true);
    expect(coerceBoolean('DA')).toBe(true);
    expect(coerceBoolean('1')).toBe(true);
    expect(coerceBoolean('no')).toBe(false);
    expect(coerceBoolean('NE')).toBe(false);
    expect(coerceBoolean('maybe')).toBeNull();
    expect(coerceBoolean(true)).toBe(true);
  });

  it('matches enum values case- and separator-insensitively', () => {
    expect(coerceEnum('Active', ['active', 'paused'] as const)).toBe('active');
    expect(coerceEnum('IN PROGRESS', ['in_progress'] as const)).toBe('in_progress');
    expect(coerceEnum('unknown', ['active'] as const)).toBeNull();
  });
});

describe('isBlankRow', () => {
  it('detects spacer rows', () => {
    expect(isBlankRow(['', null, '   ', undefined])).toBe(true);
    expect(isBlankRow(['', 'x'])).toBe(false);
  });
});

describe('validateImportRow', () => {
  const headers = [
    'Customer',
    'Location',
    'Device',
    'Serial Number',
    'Installed On',
    'Last Service',
    'Service Interval Days',
    'Status',
  ];
  const mapping = detectColumns(headers);

  it('accepts a clean row', () => {
    const result = validateImportRow(
      ['Hotel Neretva', 'Main building', 'Boiler VK-200', 'SN-1', '2020-05-01', '2026-01-15', '365', 'active'],
      mapping,
      1,
    );
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      customerName: 'Hotel Neretva',
      deviceName: 'Boiler VK-200',
      installedOn: '2020-05-01',
      lastServiceAt: '2026-01-15',
      serviceIntervalDays: 365,
      status: 'active',
    });
  });

  it('defaults status to active when the column is blank', () => {
    const result = validateImportRow(
      ['Hotel', 'Site', 'Boiler', '', '', '', '', ''],
      mapping,
      1,
    );
    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe('active');
  });

  it('collects every missing required field in one pass', () => {
    const result = validateImportRow(['', '', '', 'SN-2', '', '', '', ''], mapping, 3);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.field).sort()).toEqual([
      'customerName',
      'deviceName',
      'locationName',
    ]);
    expect(result.rowNumber).toBe(3);
  });

  it('rejects an out-of-range interval', () => {
    const result = validateImportRow(
      ['Hotel', 'Site', 'Boiler', '', '', '', '99999', ''],
      mapping,
      1,
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.field).toBe('serviceIntervalDays');
  });

  it('rejects an unparseable date with a helpful message', () => {
    const result = validateImportRow(
      ['Hotel', 'Site', 'Boiler', '', 'last spring', '', '', ''],
      mapping,
      1,
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a status outside the enum', () => {
    const result = validateImportRow(
      ['Hotel', 'Site', 'Boiler', '', '', '', '', 'broken'],
      mapping,
      1,
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.field).toBe('status');
  });

  it('catches a service date that precedes installation', () => {
    const result = validateImportRow(
      ['Hotel', 'Site', 'Boiler', '', '2026-05-01', '2020-01-01', '', ''],
      mapping,
      1,
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.field).toBe('lastServiceAt');
  });

  it('warns rather than fails on an ambiguous date', () => {
    const result = validateImportRow(
      ['Hotel', 'Site', 'Boiler', '', '03/04/2026', '', '', ''],
      mapping,
      1,
    );
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toContain('2026-04-03');
  });
});

describe('buildImportPreview', () => {
  const headers = ['Kupac', 'Lokacija', 'Uređaj', 'Serijski broj', 'Interval dana'];

  it('summarises a mixed file without writing anything', () => {
    const preview = buildImportPreview(headers, [
      ['Hotel Neretva', 'Glavna zgrada', 'Kotao 1', 'SN-1', '365'],
      ['', '', '', '', ''], // blank spacer
      ['Hotel Neretva', 'Glavna zgrada', '', 'SN-2', '365'], // missing device
      ['Klinika Sunce', 'Prizemlje', 'Klima 3', 'SN-3', 'abc'], // bad interval
    ]);

    expect(preview.totalRows).toBe(3);
    expect(preview.skippedBlankRows).toBe(1);
    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(2);
    expect(preview.canCommit).toBe(true);
  });

  it('refuses to commit when a required column is missing entirely', () => {
    const preview = buildImportPreview(
      ['Serial', 'Model'],
      [['SN-1', 'VK-200']],
    );
    expect(preview.mapping.missingRequired.length).toBeGreaterThan(0);
    expect(preview.canCommit).toBe(false);
  });

  it('refuses to commit when no row is valid', () => {
    const preview = buildImportPreview(headers, [['', 'Glavna zgrada', '', '', '']]);
    expect(preview.validRows).toBe(0);
    expect(preview.canCommit).toBe(false);
  });

  it('flags duplicate serial numbers inside the file', () => {
    const preview = buildImportPreview(headers, [
      ['Hotel', 'Site', 'Kotao 1', 'SN-1', '365'],
      ['Hotel', 'Site', 'Kotao 2', 'sn-1', '365'],
      ['Hotel', 'Site', 'Kotao 3', 'SN-2', '365'],
    ]);
    expect(preview.duplicateSerials).toEqual(['sn-1']);
  });

  it('counts rows carrying warnings', () => {
    const preview = buildImportPreview(
      [...headers, 'Datum ugradnje'],
      [['Hotel', 'Site', 'Kotao', 'SN-9', '365', '03/04/2026']],
    );
    expect(preview.warningRows).toBe(1);
    expect(preview.validRows).toBe(1);
  });

  it('numbers rows from 1, excluding the header', () => {
    const preview = buildImportPreview(headers, [
      ['Hotel', 'Site', 'Kotao 1', 'SN-1', '365'],
      ['Hotel', 'Site', 'Kotao 2', 'SN-2', '365'],
    ]);
    expect(preview.rows.map((r) => r.rowNumber)).toEqual([1, 2]);
  });
});
