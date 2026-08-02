import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier'

/**
 * ESLint konfiguracija (flat config).
 *
 * `eslint-config-next` od verzije 16 izvozi flat config direktno, pa nam
 * `FlatCompat` više ne treba.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'out/**',
      'next-env.d.ts',
      // Generisano automatski — ne provjeravamo stil generisanog koda.
      'types/supabase.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextCoreWebVitals,
  prettier,

  {
    rules: {
      // `any` je zabranjen — koristi `unknown` + Zod.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Napomena: `consistent-type-imports` traži tipske informacije, a Next-ov
      // parser ih ne prosljeđuje. Pravilo je izostavljeno — `verbatimModuleSyntax`
      // je isključen, pa nepotrebni uvozi tipova ionako ne završe u paketu.
      // Tihi `catch` blokovi su zabranjeni — greška se mora obraditi ili proslijediti.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/repositories/*'],
              message:
                'UI komponente ne smiju direktno zvati repozitorije. Koristi sloj `services/`.',
            },
          ],
        },
      ],
    },
  },

  {
    // Serverski moduli smiju koristiti console za strukturirane logove.
    files: [
      'lib/**/*.ts',
      'services/**/*.ts',
      'repositories/**/*.ts',
      'scripts/**/*.ts',
      'app/api/**/*.ts',
    ],
    rules: {
      'no-console': 'off',
      'no-restricted-imports': 'off',
    },
  },

  {
    files: ['tests/**/*.{ts,tsx}', 'e2e/**/*.ts', 'scripts/**/*.ts', 'supabase/seed/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  {
    /*
     * Predlošci e-pošte grade kompletan HTML dokument, uključujući `<head>`.
     * To nisu Next.js stranice, pa pravilo o `next/head` ovdje ne vrijedi.
     */
    files: ['components/emails/**/*.tsx'],
    rules: {
      '@next/next/no-head-element': 'off',
      '@next/next/no-img-element': 'off',
    },
  },

  {
    // Three.js JSX elementi (`<mesh>`, `<boxGeometry>` …) nisu poznati React pluginu.
    files: ['components/three/**/*.tsx'],
    rules: {
      'react/no-unknown-property': 'off',
    },
  },
)
