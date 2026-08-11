import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

/**
 * Flat config — the only format ESLint 9 reads. A `.eslintrc.json` is silently
 * ignored, which looks exactly like "no lint errors".
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      '.auth/**',
      'app/public/**', // browser scripts, linted by nothing here on purpose
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    files: ['eslint.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,

      /**
       * The rules that catch the mistakes that actually cost time:
       *
       *  no-wait-for-timeout   — a sleep is either too short (flaky) or too
       *                          long (slow), and wrong on another machine
       *                          either way
       *  no-force-option       — { force: true } skips the actionability
       *                          checks, so the test stops noticing that the
       *                          button is covered or disabled
       *  missing-playwright-await — an un-awaited expect never fails
       *  no-focused-test       — a committed .only silently skips the rest
       */
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'error',
      'playwright/missing-playwright-await': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'warn',
      'playwright/expect-expect': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-conditional-in-test': 'warn',

      // Response bodies are `any` until asserted; that is inherent to testing
      // an HTTP boundary rather than a weakness in the tests.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
