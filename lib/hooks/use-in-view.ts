'use client'

import * as React from 'react'

/**
 * Javlja da li je element vidljiv u prozoru.
 *
 * Koristi se da 3D scena i scroll animacije rade SAMO dok su na ekranu.
 * Animacija koja se vrti u pozadini troši bateriju i ne donosi ništa.
 */
export function useInView<T extends Element>(
  options: { rootMargin?: string; threshold?: number; once?: boolean } = {},
): { ref: React.RefObject<T | null>; inView: boolean } {
  const { rootMargin = '0px', threshold = 0, once = false } = options
  const ref = React.useRef<T>(null)
  const [inView, setInView] = React.useState(false)

  React.useEffect(() => {
    const element = ref.current
    if (!element) return

    /*
     * Bez podrške za IntersectionObserver pretpostavljamo da je vidljivo —
     * bolje je prikazati sadržaj nego ga sakriti.
     *
     * Ažuriranje ide kroz tajmer, dakle iza asinhrone granice: sinhroni
     * `setState` u tijelu efekta izazvao bi kaskadni render.
     */
    if (typeof IntersectionObserver === 'undefined') {
      const timer = setTimeout(() => setInView(true), 0)
      return () => clearTimeout(timer)
    }

    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry || cancelled) return
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin, threshold },
    )

    observer.observe(element)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [rootMargin, threshold, once])

  return { ref, inView }
}

/**
 * Da li je stranica trenutno vidljiva (kartica u prvom planu).
 * Skrivena kartica ne treba trošiti GPU.
 */
export function useDocumentVisible(): boolean {
  const subscribe = React.useCallback((onChange: () => void) => {
    if (typeof document === 'undefined') return () => {}
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return React.useSyncExternalStore(
    subscribe,
    () => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'),
    () => true,
  )
}
