import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getServerEnv } from '@/lib/env'

/**
 * Javni tokeni: QR kodovi, linkovi za rezervaciju i linkovi ka izvještajima.
 *
 * Pravila:
 *   • token nastaje iz `crypto.randomBytes` — nikad iz brojača, vremena ili ID-a;
 *   • u bazu ide SAMO heš (SHA-256 preko tokena i tajne iz okruženja);
 *   • sirovi token postoji jedino u URL-u koji kupac dobije;
 *   • poređenje ide kroz `timingSafeEqual` da vrijeme odgovora ništa ne oda.
 *
 * Ako `PUBLIC_TOKEN_SECRET` ikad promijenite, SVI postojeći QR kodovi i linkovi
 * prestaju raditi. To je namjerno — tako se cijeli sistem tokena može poništiti
 * jednim potezom ako zatreba.
 */

/** 32 bajta ≈ 256 bita entropije. Pogađanje nije izvodljivo. */
const TOKEN_BYTES = 32

/**
 * Abeceda bez znakova koji se lako pobrkaju pri prepisivanju s naljepnice
 * (0/O, 1/l/I). Kupac ponekad token prekucava rukom.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export type TokenPurpose = 'qr' | 'booking' | 'report' | 'invitation'

/** Dužina tokena po namjeni. QR je kraći jer se ponekad prepisuje ručno. */
const TOKEN_LENGTH: Record<TokenPurpose, number> = {
  qr: 22,
  booking: 32,
  report: 32,
  invitation: 32,
}

/**
 * Generiše kriptografski siguran token.
 *
 * Modulo bias se izbjegava odbacivanjem bajtova iznad najvećeg višekratnika
 * dužine abecede. Bez toga bi prvih nekoliko znakova abecede bilo neznatno
 * vjerovatnije — mala, ali nepotrebna slabost.
 */
export function generateToken(purpose: TokenPurpose = 'booking'): string {
  const length = TOKEN_LENGTH[purpose]
  const alphabetLength = ALPHABET.length
  const maxAcceptable = Math.floor(256 / alphabetLength) * alphabetLength - 1

  let token = ''
  while (token.length < length) {
    const bytes = randomBytes(Math.max(TOKEN_BYTES, length * 2))
    for (const byte of bytes) {
      if (token.length >= length) break
      if (byte > maxAcceptable) continue
      token += ALPHABET[byte % alphabetLength]
    }
  }

  return token
}

/**
 * Heš tokena za pohranu.
 * Tajna iz okruženja ulazi u heš, pa ni kopija baze bez tajne ne omogućava
 * provjeru pogođenog tokena.
 */
export function hashToken(rawToken: string): string {
  const { PUBLIC_TOKEN_SECRET } = getServerEnv()
  return createHash('sha256').update(`${PUBLIC_TOKEN_SECRET}:${rawToken}`).digest('hex')
}

/** Kratka oznaka za prikaz u listi. Nikad ne otkriva dovoljno za pogađanje. */
export function tokenHint(rawToken: string): string {
  return rawToken.slice(0, 6)
}

/** Poređenje otporno na mjerenje vremena odgovora. */
export function verifyTokenHash(rawToken: string, storedHash: string): boolean {
  if (!rawToken || !storedHash) return false

  const computed = hashToken(rawToken)
  const computedBuffer = Buffer.from(computed, 'hex')
  const storedBuffer = Buffer.from(storedHash, 'hex')

  if (computedBuffer.length !== storedBuffer.length) return false
  return timingSafeEqual(computedBuffer, storedBuffer)
}

/** Odbija očito neispravan token prije nego što uopšte pogodimo bazu. */
export function isWellFormedToken(value: unknown, purpose?: TokenPurpose): value is string {
  if (typeof value !== 'string') return false
  if (value.length < 12 || value.length > 64) return false
  if (purpose && value.length !== TOKEN_LENGTH[purpose]) {
    // Demo token je namjerno izuzetak — vidi `isDemoToken`.
    if (!isDemoToken(value)) return false
  }
  return /^[A-Za-z0-9]+$/.test(value)
}

/**
 * Demo token.
 *
 * Javna stranica `/u/demo` mora raditi i biti čitljiva u marketinškim
 * materijalima. Zato je to jedini token koji nije nasumičan. Vezan je
 * isključivo za demo organizaciju i ne daje pristup ničemu stvarnom.
 */
export const DEMO_TOKEN = 'demo'

export function isDemoToken(value: string): boolean {
  return value === DEMO_TOKEN
}

/**
 * Heš IP adrese za ograničavanje zloupotrebe i revizijski dnevnik.
 * Sirova adresa se nikad ne pohranjuje — heš je dovoljan da se prepozna
 * ponovljeni izvor, a nije lični podatak u čitljivom obliku.
 */
export function hashIpAddress(ip: string): string {
  const { PUBLIC_TOKEN_SECRET } = getServerEnv()
  return createHash('sha256').update(`ip:${PUBLIC_TOKEN_SECRET}:${ip}`).digest('hex').slice(0, 32)
}

/** Nasumičan naziv datoteke — ime koje je poslao korisnik nikad ne ide na disk. */
export function generateSafeFileName(originalName: string): string {
  const extensionMatch = /\.([A-Za-z0-9]{1,8})$/.exec(originalName)
  const extension = extensionMatch?.[1]?.toLowerCase() ?? 'bin'
  return `${randomBytes(16).toString('hex')}.${extension}`
}
