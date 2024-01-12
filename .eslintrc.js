// @ts-check

const config = {
  extends: ['@sourcegraph/eslint-config', 'plugin:storybook/recommended'],
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  root: true,
  parserOptions: {
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    EXPERIMENTAL_useProjectService: true,
    project: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'import/order': 'off',
    'id-length': 'off',
    'etc/no-deprecated': 'off', // slow
    'arrow-body-style': 'off',
    'unicorn/switch-case-braces': 'off',
    'unicorn/prefer-event-target': 'off',
    'unicorn/prefer-top-level-await': 'off',
    'unicorn/prefer-dom-node-remove': 'off',
    'ban/ban': 'off',

    '@typescript-eslint/no-explicit-any': 'off',

    '@typescript-eslint/consistent-type-exports': [
      'error',
      {
        fixMixedExportsWithInlineTypeSpecifier: true,
      },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      {
        fixStyle: 'inline-type-imports',
        disallowTypeAnnotations: false,
      },
    ],
  },
  overrides: [
    {
      files: ['*.d.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      files: '*.test.ts?(x)',
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
      },
    },
    {
      files: '*.story.tsx',
      rules: {
        'react/forbid-dom-props': 'off',
        'import/no-default-export': 'off',
        'no-console': 'off',
      },
    },
    {
      files: ['vitest.workspace.js', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
  ],
}
module.exports = config
