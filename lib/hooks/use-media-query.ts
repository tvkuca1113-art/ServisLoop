'use client'

import * as React from 'react'

/**
 * Prati CSS media upit.
 *
 * Koristi `useSyncExternalStore` da bi vrijednost na serveru i pri hidraciji
 * bila predvidiva (uvijek `false`), a zatim se odmah uskladi sa stvarnim
 * stanjem preglednika. Time izbjegavamo trepćući sadržaj.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }, [query])

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** Korisnik je u sistemskim postavkama zatražio manje animacije. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** Ekran uži od `lg` — koristi se za pojednostavljenu 3D scenu na mobitelu. */
export function useIsSmallScreen(): boolean {
  return useMediaQuery('(max-width: 1023px)')
}

/** Uređaj bez preciznog pokazivača (dodir) — isključujemo parallax na pomjeraj miša. */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
