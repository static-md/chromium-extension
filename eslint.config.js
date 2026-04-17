import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/excalidraw-assets/**',
      'legacy/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...react.configs.flat.recommended,
    files: ['src/editor/**/*.{ts,tsx,js,jsx}'],
    settings: { react: { version: '19.2.5' } },
  },
  {
    ...react.configs.flat['jsx-runtime'],
    files: ['src/editor/**/*.{ts,tsx,js,jsx}'],
  },
  {
    ...reactHooks.configs.flat['recommended-latest'],
    files: ['src/editor/**/*.{ts,tsx,js,jsx}'],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2023,
        chrome: 'readonly',
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
  },
];
