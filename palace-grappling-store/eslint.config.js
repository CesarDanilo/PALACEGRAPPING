import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.*.mjs', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-imports': ['error', { paths: [{ name: 'zod', message: "Importe de '@/lib/zod' (modo jitless, compatível com a CSP)." }] }],
    },
  },
  { files: ['src/lib/zod.ts'], rules: { 'no-restricted-imports': 'off' } },
  { files: ['vite.config.ts'], languageOptions: { globals: { ...globals.node } } },
  { files: ['scripts/**'], languageOptions: { globals: { ...globals.node } }, rules: { 'no-console': 'off' } },
);
