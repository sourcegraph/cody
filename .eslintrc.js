// @ts-check

/** @type {import('eslint').Linter.Config} */
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
    'import/no-named-as-default': 'off', // slow
    'import/no-named-as-default-member': 'off', // slow
    'arrow-body-style': 'off',
    'unicorn/switch-case-braces': 'off',
    'unicorn/prefer-event-target': 'off',
    'unicorn/prefer-top-level-await': 'off',
    'unicorn/prefer-dom-node-remove': 'off',
    'ban/ban': 'off',
    'react/no-array-index-key': 'off',
    'jsdoc/require-yields': 'off',

    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',

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

    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@sourcegraph/cody-shared/*'],
            message:
              'Please import from @sourcegraph/cody-shared instead of subpaths. If you need to use something that is not exported by @sourcegraph/cody-shared, just update lib/shared/src/index.ts to export the thing you need. Reasons for this restriction: (1) enforce a clean boundary between the internal and external API of the shared lib, (2) avoid accidentally bundling multiple copies of the shared lib.',
          },
        ],
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
      files: ['*.test.ts?(x)', '**/testutils/**', '**/e2e/**'],
      rules: {
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
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
