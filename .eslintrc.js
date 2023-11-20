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
    EXPERIMENTAL_useSourceOfProjectReferenceRedirect: true,
    project: [
      __dirname + '/e2e-inspector/tsconfig.json',
      __dirname + '/e2e/tsconfig.json',
      __dirname + '/agent/tsconfig.json',
      __dirname + '/cli/tsconfig.json',
      __dirname + '/lib/ui/tsconfig.json',
      __dirname + '/lib/shared/tsconfig.json',
      __dirname + '/slack/tsconfig.json',
      __dirname + '/vscode/tsconfig.json',
      __dirname + '/vscode/test/integration/tsconfig.json',
      __dirname + '/vscode/scripts/tsconfig.json',
      __dirname + '/web/tsconfig.json',
      __dirname + '/tsconfig.json',
    ],
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
  },
  overrides: [
    {
      files: ['*.d.ts'],
      rules: {
        'no-restricted-imports': 'off',
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
