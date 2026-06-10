// .eslintrc.cjs — CommonJS required because package.json sets "type": "module"
'use strict';

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // ── Boundary rule: core/ must not import NestJS or Discord ──────────────
      // Violations here = architecture breach. Keep core/ framework-free.
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
                  'Move this to the shell (app.module.ts, infra/) or platforms/.',
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
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.cjs', 'vitest.config.ts'],
};
