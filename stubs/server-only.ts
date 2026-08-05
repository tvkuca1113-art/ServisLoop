/**
 * Test stub for the `server-only` package.
 *
 * The real package resolves to a module that throws unless the React Server Components
 * bundler picked the "server" export condition. Vitest runs in plain Node, so importing
 * any module that guards itself with `import 'server-only'` would fail at load time —
 * which would make the server layer untestable purely as an artefact of the guard.
 *
 * Aliasing it to this empty module in `vitest.config.ts` keeps the guard doing its real
 * job in `next build` while letting the integration tests import the same modules the
 * application does.
 */
export {};
