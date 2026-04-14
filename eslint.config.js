import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': ['error', { allow: ['error'] }],
      'no-debugger': 'error',
    },
  },
];
