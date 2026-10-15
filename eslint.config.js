import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'src/extension/vendor/**',
      'dist/**',
      'node_modules/**',
      '.cache/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
);
