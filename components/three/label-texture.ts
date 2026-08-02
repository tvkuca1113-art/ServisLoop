import * as THREE from 'three'

/**
 * Pravi teksturu s tekstom preko 2D canvasa.
 *
 * Zašto ovako, a ne `drei/Text` ili `drei/Html`:
 *   • `Text` traži učitavanje font datoteke (dodatni mrežni zahtjev i rizik da
 *     bosanska slova č/ć/ž/š/đ nedostaju u podskupu fonta);
 *   • `Html` ubacuje DOM elemente koje preglednik mora pozicionirati u svakom
 *     kadru;
 *   • canvas tekstura se napravi jednom, koristi sistemski font (dakle ima sva
 *     naša slova) i u renderu je obična slika — najjeftinija opcija.
 *
 * Teksture se keširaju po ključu i oslobađaju kroz `disposeLabelCache()`.
 */

const cache = new Map<string, THREE.CanvasTexture>()

export interface LabelOptions {
  text: string
  /** Manji tekst iznad glavnog, npr. redni broj koraka. */
  eyebrow?: string
  accent?: string
  /** Piksela po jedinici teksture — veće daje oštriji tekst. */
  scale?: number
}

const FONT_STACK =
  '600 34px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
const EYEBROW_FONT =
  '600 22px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Odnos širine i visine dobijene teksture — potreban za veličinu ravnine. */
export interface LabelTexture {
  texture: THREE.CanvasTexture
  aspect: number
}

export function createLabelTexture({
  text,
  eyebrow,
  accent = '#18C7B5',
  scale = 2,
}: LabelOptions): LabelTexture | null {
  const key = `${text}|${eyebrow ?? ''}|${accent}|${scale}`
  const cached = cache.get(key)

  const paddingX = 28
  const paddingY = 18
  const eyebrowHeight = eyebrow ? 30 : 0

  // Mjerenje mora ići kroz privremeni kontekst prije nego znamo veličinu.
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  if (!measureCtx) return null

  measureCtx.font = FONT_STACK
  const textWidth = measureCtx.measureText(text).width
  measureCtx.font = EYEBROW_FONT
  const eyebrowWidth = eyebrow ? measureCtx.measureText(eyebrow).width : 0

  const contentWidth = Math.max(textWidth, eyebrowWidth)
  const width = Math.ceil(contentWidth + paddingX * 2)
  const height = Math.ceil(44 + eyebrowHeight + paddingY * 2)
  const aspect = width / height

  if (cached) return { texture: cached, aspect }

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(scale, scale)

  // Pozadinska pilula sa suptilnim staklom.
  const radius = height / 2
  ctx.beginPath()
  ctx.roundRect(0.75, 0.75, width - 1.5, height - 1.5, radius)
  ctx.fillStyle = 'rgba(9, 22, 38, 0.82)'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)'
  ctx.stroke()

  // Akcentna tačka lijevo.
  ctx.beginPath()
  ctx.arc(paddingX - 12, height / 2, 4, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()

  let cursorY = paddingY

  if (eyebrow) {
    ctx.font = EYEBROW_FONT
    ctx.fillStyle = accent
    ctx.textBaseline = 'top'
    ctx.fillText(eyebrow, paddingX + 4, cursorY)
    cursorY += eyebrowHeight
  }

  ctx.font = FONT_STACK
  ctx.fillStyle = '#EEF3F9'
  ctx.textBaseline = 'top'
  ctx.fillText(text, paddingX + 4, cursorY)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  cache.set(key, texture)
  return { texture, aspect }
}

/** Oslobađa sve keširane teksture — poziva se pri odmontiranju scene. */
export function disposeLabelCache(): void {
  for (const texture of cache.values()) texture.dispose()
  cache.clear()
}
