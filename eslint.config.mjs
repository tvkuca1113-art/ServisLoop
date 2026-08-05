import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'dist/**',
      'coverage/**',
      '.data/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/*'],
              importNames: ['*'],
              message:
                'Do not import server modules from the domain layer. The domain layer must stay pure.',
            },
          ],
        },
      ],
    },
  },
  {
    // The domain layer is the deterministic core: no I/O, no ambient time, no randomness.
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/__tests__/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'The domain layer must not perform I/O.' },
        { name: 'localStorage', message: 'The domain layer must not perform I/O.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Domain functions must receive `now` explicitly to stay deterministic.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'The domain layer must be deterministic; no randomness.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Domain functions must receive `now` explicitly to stay deterministic.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default config;
