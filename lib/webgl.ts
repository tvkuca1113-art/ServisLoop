/**
 * Otkrivanje WebGL podrške i procjena snage uređaja.
 *
 * Marketing stranica mora biti potpuno upotrebljiva i kad WebGL ne radi
 * (stari preglednik, isključeno hardversko ubrzanje, korporativna politika,
 * virtuelna mašina). Zato se 3D scena pokreće tek nakon što ovdje potvrdimo
 * da kontekst zaista može nastati.
 */

export type DeviceTier = 'low' | 'medium' | 'high'

let cachedSupport: boolean | null = null

/** Pokušava stvarno napraviti WebGL kontekst. Rezultat se kešira. */
export function isWebGLAvailable(): boolean {
  if (cachedSupport !== null) return cachedSupport
  if (typeof window === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    const context =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')

    cachedSupport = Boolean(context)

    // Odmah oslobađamo probni kontekst — preglednici imaju mali limit.
    if (context && 'getExtension' in context) {
      const loseContext = (context as WebGLRenderingContext).getExtension('WEBGL_lose_context')
      loseContext?.loseContext()
    }
  } catch {
    cachedSupport = false
  }

  return cachedSupport
}

/**
 * Gruba procjena snage uređaja iz signala koji su besplatni i ne zahtijevaju
 * mjerenje performansi. Namjerno konzervativno: kad nismo sigurni, biramo
 * jednostavniju scenu.
 */
export function detectDeviceTier(): DeviceTier {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'low'

  const cores = navigator.hardwareConcurrency ?? 2
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const narrow = window.innerWidth < 768

  if (cores <= 4 || memory <= 4 || (coarsePointer && narrow)) return 'low'
  if (cores <= 8 || memory <= 8) return 'medium'
  return 'high'
}

/** Gornja granica `devicePixelRatio` — sprječava rendere 3× veće od potrebnog. */
export function maxPixelRatioFor(tier: DeviceTier): number {
  return { low: 1, medium: 1.5, high: 2 }[tier]
}

/**
 * Korisnik štedi bateriju ili je na ograničenoj vezi.
 * `saveData` je dio Network Information API-ja i nije svugdje dostupan.
 */
export function prefersReducedData(): boolean {
  if (typeof navigator === 'undefined') return false
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection
  if (!connection) return false
  if (connection.saveData) return true
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g'
}
