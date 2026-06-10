// eslint.config.js — ESLint v9 flat config (ESM, matching package.json "type":"module")
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Global ignores ─────────────────────────────────────────────────────────
  {
    ignores: ['dist/**', 'node_modules/**', 'spike/**', 'coverage/**'],
  },

  // ── Base config for all TypeScript source files ────────────────────────────
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // ── Boundary rule: src/core/ must be framework-free ────────────────────────
  // Violations here = architecture breach. Fail the build, not just a warning.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*'],
              message:
                'BOUNDARY VIOLATION: src/core/ must not import @nestjs/*. ' +
                'Move this to the shell (app.module.ts / infra/) or platforms/.',
            },
            {
              group: ['discord.js', 'necord', '@discordjs/*'],
              message:
                'BOUNDARY VIOLATION: src/core/ must not import Discord packages. ' +
                'Move this to src/platforms/discord/.',
            },
          ],
        },
      ],
    },
  },
];
