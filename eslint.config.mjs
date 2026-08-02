import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

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
      'types/supabase.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends('next/core-web-vitals'),
  prettier,
  {
    rules: {
      // `any` je zabranjen — koristi `unknown` + Zod.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Tihi `catch` blokovi su zabranjeni — greška se mora obraditi ili proslijediti.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/repositories/*'],
              importNames: ['*'],
              message:
                'UI komponente ne smiju direktno zvati repozitorije. Koristi sloj `services/`.',
            },
          ],
        },
      ],
    },
  },
  {
    // Server-only moduli smiju koristiti console za strukturirane logove.
    files: ['lib/**/*.ts', 'services/**/*.ts', 'repositories/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    // Three.js JSX elementi (`<mesh>`, `<boxGeometry>` …) nisu poznati eslint-react-u.
    files: ['components/three/**/*.tsx'],
    rules: {
      'react/no-unknown-property': 'off',
    },
  },
)
