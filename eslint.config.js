import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'functions/lib/**',
      'node_modules/**',
      'functions/node_modules/**',
      'rss_markdown/**',
      '.firebase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Existing data boundaries still use `any`; migrate these gradually.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Several components intentionally synchronize local state from props.
      'react-hooks/set-state-in-effect': 'warn',
      'prefer-const': 'warn',
    },
  },
  {
    files: ['functions/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'warn',
    },
  },
);
