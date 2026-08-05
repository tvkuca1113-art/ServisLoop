import { NextResponse, type NextRequest } from 'next/server';

import { devicePublicUrl } from '@/lib/env';
import { slugify } from '@/lib/utils';
import { requirePermission } from '@/server/auth/context';
import { getRepository } from '@/server/data';
import { clampPngSize, DEFAULT_PNG_SIZE, deviceQrPng, deviceQrSvg } from '@/server/qr/generate';

/**
 * The QR image for one device.
 *
 * `GET /api/devices/{id}/qr?format=svg|png&size=512`
 *
 * Authenticated and tenant-scoped, even though the image it returns only encodes a URL
 * that is itself public. Two reasons: the device *id* is internal, so accepting it from
 * an anonymous caller would turn this route into an oracle for which ids exist; and the
 * public token must not leak to anyone who has not already been granted access to the
 * device record. A member of another organisation gets the same 404 as a device that was
 * never created — the lookup is scoped by `session.organization.id`, so there is nothing
 * to distinguish the two cases.
 *
 * Cached `private, max-age=3600`: the image is a pure function of the device's token, so
 * it is stable for as long as the token is, but it is scoped to one signed-in user and
 * must never land in a shared cache.
 */

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'private, max-age=3600';

export async function GET(
  request: NextRequest,
  // Next 15 hands route params as a promise.
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await requirePermission('device:read');
  const { id } = await params;

  const repo = getRepository();
  const device = await repo.getDevice(session.organization.id, id);
  if (!device) {
    return NextResponse.json({ error: 'Device not found.' }, { status: 404 });
  }

  const url = devicePublicUrl(device.publicToken);
  const format = request.nextUrl.searchParams.get('format') === 'png' ? 'png' : 'svg';

  // A stable, meaningful download name — `qr.svg` in a downloads folder full of them is
  // useless. The label sheet and the device page both link here with `download`.
  const stem = `servisloop-qr-${slugify(device.serialNumber ?? device.name) || 'device'}`;

  if (format === 'png') {
    const requested = Number(request.nextUrl.searchParams.get('size') ?? DEFAULT_PNG_SIZE);
    const png = await deviceQrPng(url, clampPngSize(requested));

    // `Buffer` is a `Uint8Array`; copying into a plain one keeps the Web `Response` body
    // types happy without a cast.
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.byteLength),
        'Content-Disposition': `inline; filename="${stem}.png"`,
        'Cache-Control': CACHE_CONTROL,
      },
    });
  }

  const svg = await deviceQrSvg(url);

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `inline; filename="${stem}.svg"`,
      'Cache-Control': CACHE_CONTROL,
    },
  });
}
