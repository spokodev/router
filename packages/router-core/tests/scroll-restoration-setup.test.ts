// @vitest-environment node

import { afterEach, describe, expect, test, vi } from 'vitest'
import { setupScrollRestoration } from '../src/scroll-restoration'
import type { AnyRouter } from '../src'

// Regression coverage for https://github.com/TanStack/router/issues/7472 —
// `setupScrollRestoration` accessed `addEventListener`, `scrollX`, `scrollY`,
// `scrollTo`, and `history` as bare globals starting in router-core@1.171.4.
// In non-browser-global host environments (Node alone, or Node with a
// jsdom DOM shim that only copies the window's own enumerable properties
// onto `globalThis`), bare access to those identifiers throws a
// `ReferenceError`, breaking router construction before any test code can
// run.
//
// These tests use the `node` test environment so that no DOM shim is
// active by default. They then opt into a partial browser environment by
// stubbing only the properties the fix is expected to use via `window.`
// — mirroring the broken host where `window` exists but the bare
// identifiers do not.

function createMockRouter(
  overrides: Partial<{
    isServer: boolean
    isScrollRestorationSetup: boolean
    scrollRestoration: boolean
  }> = {},
): AnyRouter {
  return {
    options: { scrollRestoration: overrides.scrollRestoration ?? true },
    isServer: overrides.isServer ?? false,
    isScrollRestoring: false,
    isScrollRestorationSetup: overrides.isScrollRestorationSetup ?? false,
    resetNextScroll: true,
    subscribe: vi.fn(() => () => undefined),
  } as unknown as AnyRouter
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('setupScrollRestoration (issue #7472)', () => {
  test('returns early without throwing when `window` is undefined (pure Node host)', () => {
    // No DOM shim — `window`, `history`, `addEventListener`, `scrollTo` are
    // all absent from `globalThis`. Pre-regression behaviour was that
    // construction simply did nothing on the server; this test pins that
    // contract for the client-side `setupScrollRestoration` path too, so
    // tests that build a router under Node (without jsdom) succeed.
    const router = createMockRouter({ isServer: false })

    expect(() => setupScrollRestoration(router)).not.toThrow()
    expect(router.subscribe).not.toHaveBeenCalled()
  })

  test('accesses scroll APIs through `window` rather than bare globals when `window` is defined', () => {
    // Simulate the broken host: `window` and its methods exist as
    // properties on `globalThis.window`, but the bare identifiers are not
    // attached to `globalThis`. `document` is required by the existing
    // (already-qualified) scroll-event listener and is stubbed accordingly.
    const addEventListener = vi.fn()
    const scrollTo = vi.fn()
    const documentAddEventListener = vi.fn()

    vi.stubGlobal('window', {
      addEventListener,
      scrollX: 0,
      scrollY: 0,
      scrollTo,
      history: { scrollRestoration: 'auto' as ScrollRestoration },
    })
    vi.stubGlobal('document', { addEventListener: documentAddEventListener })

    const router = createMockRouter({ isServer: false })

    expect(() => setupScrollRestoration(router)).not.toThrow()

    // `pagehide` listener attached on the qualified window, not via a bare
    // identifier that would resolve to `undefined` in the broken host.
    expect(addEventListener).toHaveBeenCalledWith(
      'pagehide',
      expect.any(Function),
    )
    expect((window as Window).history.scrollRestoration).toBe('manual')

    // Pre-existing `document.addEventListener('scroll', …)` qualification
    // is preserved.
    expect(documentAddEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      true,
    )

    // Router's own subscribe hooks for onBeforeLoad + onRendered fire.
    expect(router.subscribe).toHaveBeenCalledTimes(2)
  })

  test('still respects the existing server-side and re-entry bail-outs', () => {
    // Server-side: must return without touching browser globals even when
    // `window` happens to exist (mixed host).
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      history: { scrollRestoration: 'auto' as ScrollRestoration },
    })
    const serverRouter = createMockRouter({ isServer: true })
    expect(() => setupScrollRestoration(serverRouter)).not.toThrow()
    expect(serverRouter.subscribe).not.toHaveBeenCalled()
    vi.unstubAllGlobals()

    // Re-entry guard: a router that has already had setup completed must
    // not re-subscribe on a second call.
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      scrollX: 0,
      scrollY: 0,
      scrollTo: vi.fn(),
      history: { scrollRestoration: 'auto' as ScrollRestoration },
    })
    vi.stubGlobal('document', { addEventListener: vi.fn() })
    const setupOnce = createMockRouter({
      isServer: false,
      isScrollRestorationSetup: true,
    })
    expect(() => setupScrollRestoration(setupOnce)).not.toThrow()
    expect(setupOnce.subscribe).not.toHaveBeenCalled()
  })
})
