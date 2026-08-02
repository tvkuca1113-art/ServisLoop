import 'server-only'
import QRCode from 'qrcode'

/**
 * Generisanje QR kodova na serveru.
 *
 * Koristi se za javne stranice uređaja, naljepnice za štampu i PDF izvještaje.
 * Sve se radi na serveru: klijent nikad ne dobija biblioteku za QR, a
 * naljepnice se mogu generisati i kad je JavaScript isključen.
 *
 * Nivo korekcije grešaka je namjerno „M“ (oko 15 %) — dovoljno da kod radi i
 * kad je naljepnica malo prljava ili izgrebana na vanjskoj jedinici, a da
 * kod ostane dovoljno rijedak za štampu na maloj površini.
 */

export interface QrOptions {
  /** Širina u pikselima za rasterski izlaz. */
  width?: number
  /** Bijeli rub oko koda, u modulima. Ispod 2 čitači često ne prepoznaju kod. */
  margin?: number
  darkColor?: string
  lightColor?: string
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
}

const DEFAULTS: Required<QrOptions> = {
  width: 512,
  margin: 2,
  darkColor: '#0C1B2E',
  lightColor: '#FFFFFF',
  errorCorrectionLevel: 'M',
}

function resolve(options: QrOptions | undefined): Required<QrOptions> {
  return { ...DEFAULTS, ...options }
}

/** QR kod kao SVG string — najbolji izbor za štampu i za ugradnju u stranicu. */
export async function generateQrSvg(text: string, options?: QrOptions): Promise<string> {
  if (!text) throw new Error('generateQrSvg(): tekst ne smije biti prazan')
  const config = resolve(options)

  return QRCode.toString(text, {
    type: 'svg',
    margin: config.margin,
    errorCorrectionLevel: config.errorCorrectionLevel,
    color: { dark: config.darkColor, light: config.lightColor },
  })
}

/** QR kod kao `data:` URL s PNG slikom — za `<img>` i za PDF. */
export async function generateQrDataUrl(text: string, options?: QrOptions): Promise<string> {
  if (!text) throw new Error('generateQrDataUrl(): tekst ne smije biti prazan')
  const config = resolve(options)

  return QRCode.toDataURL(text, {
    width: config.width,
    margin: config.margin,
    errorCorrectionLevel: config.errorCorrectionLevel,
    color: { dark: config.darkColor, light: config.lightColor },
  })
}

/** QR kod kao PNG bajtovi — koristi se pri ugradnji u PDF. */
export async function generateQrPngBuffer(text: string, options?: QrOptions): Promise<Buffer> {
  if (!text) throw new Error('generateQrPngBuffer(): tekst ne smije biti prazan')
  const config = resolve(options)

  return QRCode.toBuffer(text, {
    type: 'png',
    width: config.width,
    margin: config.margin,
    errorCorrectionLevel: config.errorCorrectionLevel,
    color: { dark: config.darkColor, light: config.lightColor },
  })
}

/**
 * Uklanja `width`/`height` iz SVG-a da bi se kod skalirao po kontejneru,
 * i dodaje `role`/`aria-label` za čitače ekrana.
 */
export function makeQrSvgResponsive(svg: string, label: string): string {
  const escapedLabel = label.replace(/[<>&"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case '"':
        return '&quot;'
      default:
        return char
    }
  })

  return svg
    .replace(/<svg([^>]*)>/, (_match, attributes: string) => {
      const cleaned = attributes
        .replace(/\swidth="[^"]*"/, '')
        .replace(/\sheight="[^"]*"/, '')
      return `<svg${cleaned} width="100%" height="100%" role="img" aria-label="${escapedLabel}">`
    })
    .replace(/shape-rendering="crispEdges"/g, 'shape-rendering="crispEdges"')
}
