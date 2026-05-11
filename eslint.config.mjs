// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/prisma/generated/**',
      'pnpm-lock.yaml',
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules for all TS/TSX files
  ...tseslint.configs.recommended,

  {
    rules: {
      // Warn only — stubs intentionally have unimplemented bodies
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow stub throws in not-yet-implemented methods
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
)
