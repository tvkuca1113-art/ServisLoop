import { describe, expect, it } from 'vitest';

import { DEFAULT_PNG_SIZE, PNG_MAGIC, clampPngSize, deviceQrPng, deviceQrSvg } from '../generate';

/**
 * QR rendering.
 *
 * The property that matters here is determinism. A device's label is regenerated every
 * time someone opens the device page, re-prints a sheet or re-downloads the SVG, and all
 * of those must be the same image — otherwise the endpoint's `max-age=3600` cache would
 * serve one symbol while the print run carried another, and a "which sticker is current?"
 * question would have no answer.
 */

const URL_A = 'https://servisloop.app/d/demo-token-000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const URL_B = 'https://servisloop.app/d/demo-token-001-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

describe('deviceQrSvg', () => {
  it('returns an SVG document', async () => {
    const svg = await deviceQrSvg(URL_A);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    // A viewBox and no fixed width is what lets one file print at any label size.
    expect(svg).toContain('viewBox=');
  });

  it('is deterministic for the same URL', async () => {
    const [first, second] = await Promise.all([deviceQrSvg(URL_A), deviceQrSvg(URL_A)]);
    expect(first).toBe(second);
  });

  it('encodes different URLs differently', async () => {
    expect(await deviceQrSvg(URL_A)).not.toBe(await deviceQrSvg(URL_B));
  });

  it('refuses an empty URL', async () => {
    await expect(deviceQrSvg('   ')).rejects.toThrow(RangeError);
  });
});

describe('deviceQrPng', () => {
  it('returns a PNG buffer', async () => {
    const png = await deviceQrPng(URL_A);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect([...png.subarray(0, 8)]).toEqual([...PNG_MAGIC]);
    expect(png.byteLength).toBeGreaterThan(100);
  });

  it('is byte-identical for the same URL', async () => {
    const first = await deviceQrPng(URL_A);
    const second = await deviceQrPng(URL_A);
    expect(first.equals(second)).toBe(true);
  });

  it('produces different bytes for a different URL', async () => {
    const [a, b] = await Promise.all([deviceQrPng(URL_A), deviceQrPng(URL_B)]);
    expect(a.equals(b)).toBe(false);
  });

  it('scales with the requested size', async () => {
    const small = await deviceQrPng(URL_A, 128);
    const large = await deviceQrPng(URL_A, 1024);
    expect(large.byteLength).toBeGreaterThan(small.byteLength);
    // Same size requested twice is still the same file.
    expect((await deviceQrPng(URL_A, 128)).equals(small)).toBe(true);
  });

  it('rejects a size outside the supported range', async () => {
    await expect(deviceQrPng(URL_A, 4)).rejects.toThrow(RangeError);
    await expect(deviceQrPng(URL_A, 10_000)).rejects.toThrow(RangeError);
    await expect(deviceQrPng(URL_A, 200.5)).rejects.toThrow(RangeError);
  });
});

describe('clampPngSize', () => {
  it('folds anything a query string can carry onto the supported range', () => {
    expect(clampPngSize(320)).toBe(320);
    expect(clampPngSize(1)).toBe(96);
    expect(clampPngSize(99_999)).toBe(2048);
    expect(clampPngSize(320.4)).toBe(320);
    expect(clampPngSize(Number.NaN)).toBe(DEFAULT_PNG_SIZE);
  });
});
