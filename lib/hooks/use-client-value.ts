'use client'

import * as React from 'react'

/**
 * Čita vrijednost koja postoji SAMO u pregledniku (WebGL podrška, snaga
 * uređaja, `localStorage`) bez neslaganja pri hidraciji i bez `setState`
 * unutar efekta.
 *
 * Zašto `useSyncExternalStore`, a ne `useEffect` + `setState`:
 * React 19 s prevodiocem prijavljuje sinhroni `setState` u efektu kao uzrok
 * kaskadnih rendera. Ova funkcija radi isto što bi radio efekt, ali kroz
 * mehanizam koji React razumije — server dobije `serverValue`, klijent odmah
 * nakon hidracije dobije stvarnu vrijednost.
 *
 * Vrijednost se računa jednom i kešira, jer se sposobnosti preglednika ne
 * mijenjaju tokom života stranice.
 */
export function useClientValue<T>(compute: () => T, serverValue: T): T {
  const cacheRef = React.useRef<{ value: T } | null>(null)

  // Bez pretplate — vrijednost se ne mijenja, pa nema na šta reagovati.
  const subscribe = React.useCallback(() => () => {}, [])

  const getSnapshot = React.useCallback(() => {
    if (cacheRef.current === null) {
      cacheRef.current = { value: compute() }
    }
    return cacheRef.current.value
  }, [compute])

  const getServerSnapshot = React.useCallback(() => serverValue, [serverValue])

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Zastavica pohranjena u `localStorage`, otporna na privatni način rada.
 *
 * Vraća `[vrijednost, prebaci]`. Na serveru i pri prvom renderu vrijednost je
 * `defaultValue`, a stvarna se pojavi odmah nakon hidracije.
 */
export function useStoredFlag(
  key: string,
  defaultValue = false,
): [boolean, (next?: boolean) => void] {
  const listenersRef = React.useRef(new Set<() => void>())
  const overrideRef = React.useRef<boolean | null>(null)

  const subscribe = React.useCallback((listener: () => void) => {
    const listeners = listenersRef.current
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const getSnapshot = React.useCallback(() => {
    if (overrideRef.current !== null) return overrideRef.current
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? defaultValue : stored === '1'
    } catch {
      // Privatni način rada blokira pohranu — to nije greška, samo nema pamćenja.
      return defaultValue
    }
  }, [key, defaultValue])

  const getServerSnapshot = React.useCallback(() => defaultValue, [defaultValue])

  const value = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setValue = React.useCallback(
    (next?: boolean) => {
      const resolved = next ?? !value
      overrideRef.current = resolved
      try {
        window.localStorage.setItem(key, resolved ? '1' : '0')
      } catch {
        // Bez pohrane vrijednost vrijedi samo za trenutnu sesiju.
      }
      for (const listener of listenersRef.current) listener()
    },
    [key, value],
  )

  return [value, setValue]
}
