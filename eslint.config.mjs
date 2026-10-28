import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { boundariesPlugin } from './scripts/eslint-boundaries.mjs';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'artifacts/**',
    ],
  },
  { ...js.configs.recommended, files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [
          './packages/*/tsconfig.json',
          './apps/web/tsconfig.json',
          './apps/web/tsconfig.node.json',
          './tsconfig.tools.json',
          './tsconfig.browser-tests.json',
          './tsconfig.pure-tests.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { boundaries: boundariesPlugin },
    rules: { 'boundaries/imports': 'error', '@typescript-eslint/consistent-type-imports': 'error' },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    files: ['packages/simulation-worker/src/**/*.ts'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: [
      'packages/contracts/src/**/*.ts',
      'packages/simulation/src/**/*.ts',
      'packages/simulation-worker/src/**/*.ts',
    ],
    languageOptions: { parserOptions: { project: null, projectService: true } },
  },
  {
    files: ['*.config.ts', 'apps/web/vite.config.ts', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/contracts/src/**/*.ts', 'packages/simulation/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'Worker',
        'self',
        'navigator',
        'performance',
        'Date',
        'crypto',
        'fetch',
        'setTimeout',
        'setInterval',
        'requestAnimationFrame',
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Randomness must be explicitly seeded in B02.',
        },
        ...[
          'window',
          'document',
          'Worker',
          'self',
          'navigator',
          'performance',
          'Date',
          'crypto',
          'fetch',
          'setTimeout',
          'setInterval',
          'requestAnimationFrame',
        ].map((property) => ({
          object: 'globalThis',
          property,
          message: 'Platform services do not belong in the deterministic core/contracts.',
        })),
      ],
    },
  },
);
