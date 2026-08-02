import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Dva odvojena skupa testova:
 *
 *   unit        — čista domenska logika i React komponente. Bez baze, brzo.
 *   integration — stvarni PostgreSQL. Provjerava migracije, RLS izolaciju
 *                 i tokove kroz više servisa. Pokreće se serijski.
 *
 * `npm test`             → samo unit (svakodnevni rad)
 * `npm run test:all`     → oba skupa
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    projects: [
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/unit/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          setupFiles: ['./tests/integration/setup.ts'],
          include: ['tests/integration/**/*.test.ts'],
          // Integracijski testovi dijele jednu bazu — moraju ići serijski.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['domains/**/*.ts', 'lib/**/*.ts', 'services/**/*.ts'],
      exclude: ['**/*.d.ts', '**/index.ts', 'lib/supabase/**'],
    },
  },
})
