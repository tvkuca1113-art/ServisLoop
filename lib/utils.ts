import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Spaja Tailwind klase i razrješava sukobe (npr. `p-2` + `p-4` → `p-4`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Ograničava broj na zadani raspon. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Pretvara tekst u URL-siguran oblik, uz bosanska slova. */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    č: 'c',
    ć: 'c',
    ž: 'z',
    š: 's',
    đ: 'd',
    Č: 'c',
    Ć: 'c',
    Ž: 'z',
    Š: 's',
    Đ: 'd',
  }
  return input
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Inicijali za avatar, npr. "Amir Hodžić" → "AH". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase()
  return `${(parts[0] ?? '')[0] ?? ''}${(parts[parts.length - 1] ?? '')[0] ?? ''}`.toUpperCase()
}

/** Deterministički indeks boje iz teksta — za avatare i oznake. */
export function colorIndexFor(input: string, buckets: number): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % buckets
}

/** Skraćuje tekst uz „…“ bez rezanja usred riječi kad je moguće. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input
  const cut = input.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Uklanja `undefined` vrijednosti iz objekta (za PATCH operacije). */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key as keyof T] = value as T[keyof T]
  }
  return out
}

/** Dijeli niz na dijelove zadane veličine — koristi se pri uvozu i slanju. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk(): veličina mora biti veća od nule')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Grupiše niz po ključu. */
export function groupBy<T, K extends string | number>(
  items: readonly T[],
  keyFn: (item: T) => K,
): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const bucket = out.get(key)
    if (bucket) bucket.push(item)
    else out.set(key, [item])
  }
  return out
}

/** Čeka zadani broj milisekundi (koristi se za backoff pri ponovnom slanju). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Sigurno parsiranje JSON-a — vraća `null` umjesto bacanja. */
export function safeJsonParse<T = unknown>(input: string): T | null {
  try {
    return JSON.parse(input) as T
  } catch {
    return null
  }
}
