import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

/**
 * Zajednička priprema za jedinične testove.
 *
 * Vremenska zona procesa je namjerno postavljena na nešto DRUGO od
 * `Europe/Sarajevo` (Los Angeles, UTC−8) kako bi testovi otkrili svaku
 * funkciju koja se oslanja na lokalnu zonu servera umjesto na zonu
 * organizacije. To je najčešći uzrok grešaka s datumima servisa.
 */
process.env.TZ = 'America/Los_Angeles'

beforeAll(() => {
  // jsdom nema `matchMedia`; 3D hero i reduced-motion hook ga koriste.
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    })
  }

  // jsdom nema IntersectionObserver; koristi ga pauziranje animacija.
  if (!('IntersectionObserver' in window)) {
    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = ''
      readonly thresholds: readonly number[] = []
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      takeRecords = vi.fn(() => [])
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      value: MockIntersectionObserver,
    })
  }

  if (!('ResizeObserver' in window)) {
    class MockResizeObserver implements ResizeObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: MockResizeObserver,
    })
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
