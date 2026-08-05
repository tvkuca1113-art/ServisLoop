import 'server-only';

import QRCode from 'qrcode';

/**
 * QR rendering for device labels.
 *
 * A device's QR code encodes exactly one thing: the absolute URL of its public page
 * (`devicePublicUrl()` in `@/lib/env`). Nothing else — no device id, no organisation, no
 * JSON payload. A label that carries data rather than a link cannot be re-pointed later,
 * and every extra byte pushes the symbol to a higher version, which means finer modules
 * and a worse scan off a scratched sticker in a boiler room.
 *
 * The render settings are fixed here rather than passed in, so every label the product
 * has ever printed looks and scans the same:
 *
 * - **Error correction `M`** (~15% recoverable). `L` fails once a label is scuffed or
 *   splashed; `H` costs roughly a third more modules for durability a sticker under a
 *   laminate does not need.
 * - **Margin 1 module.** The spec asks for 4. One is enough when the label stock already
 *   provides white space around the symbol, and it keeps the printed dots large.
 * - **Pure black on pure white.** Contrast is what scanners actually measure; brand
 *   colours here are a bug, not a flourish.
 *
 * Output is deterministic — same URL in, byte-identical image out, every time. That is
 * what makes the label sheet reproducible and lets the endpoint cache confidently.
 */

/** Shared across both renderers so the SVG and the PNG are the same symbol. */
const BASE_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 1,
  color: { dark: '#000000ff', light: '#ffffffff' },
} as const;

/** Printed at ~2 cm square, this is comfortably above a phone camera's resolving limit. */
export const DEFAULT_PNG_SIZE = 512;

export const MIN_PNG_SIZE = 96;
export const MAX_PNG_SIZE = 2048;

/** The eight bytes every PNG file starts with. Exported so the route and tests agree. */
export const PNG_MAGIC = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function assertUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') throw new RangeError('A QR code needs a URL to encode.');
  // Practical ceiling: a version-40 symbol tops out around 2 953 bytes, and anything
  // approaching that is unscannable off a sticker long before it is unencodable.
  if (trimmed.length > 512) {
    throw new RangeError(`URL is too long to encode legibly (${trimmed.length} characters).`);
  }
  return trimmed;
}

/**
 * Scalable label artwork.
 *
 * The renderer emits a `viewBox` and no fixed width, so the same file prints crisply at
 * any physical size — which is the whole point of using SVG for a label sheet.
 */
export async function deviceQrSvg(url: string): Promise<string> {
  return QRCode.toString(assertUrl(url), { ...BASE_OPTIONS, type: 'svg' });
}

/**
 * Raster artwork, for `<img>` previews and for label software that will not take SVG.
 *
 * `width` is honoured exactly when it is a whole multiple of the module count, and
 * rounded down to one otherwise — so the returned image may be a few pixels smaller than
 * `size`. That is the renderer refusing to resample a QR symbol, which is correct: a
 * half-pixel module edge is what makes a code fail to scan.
 */
export async function deviceQrPng(url: string, size: number = DEFAULT_PNG_SIZE): Promise<Buffer> {
  if (!Number.isInteger(size) || size < MIN_PNG_SIZE || size > MAX_PNG_SIZE) {
    throw new RangeError(
      `QR PNG size must be an integer ${MIN_PNG_SIZE}..${MAX_PNG_SIZE}, received ${size}`,
    );
  }
  return QRCode.toBuffer(assertUrl(url), { ...BASE_OPTIONS, type: 'png', width: size });
}

/** Clamp a caller-supplied size onto the supported range. Used by the QR route. */
export function clampPngSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_PNG_SIZE;
  return Math.min(MAX_PNG_SIZE, Math.max(MIN_PNG_SIZE, Math.round(size)));
}
