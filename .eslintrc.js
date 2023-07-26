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
      __dirname + '/agent/tsconfig.json',
      __dirname + '/cli/tsconfig.json',
      __dirname + '/lib/ui/tsconfig.json',
      __dirname + '/lib/shared/tsconfig.json',
      __dirname + '/slack/tsconfig.json',
      __dirname + '/vscode/tsconfig.json',
      __dirname + '/vscode/test/integration/tsconfig.json',
      __dirname + '/vscode/test/completions/tsconfig.json',
      __dirname + '/vscode/scripts/tsconfig.json',
      __dirname + '/web/tsconfig.json',
      __dirname + '/tsconfig.json',
      __dirname + '/completions-review-tool/tsconfig.json',
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
      files: ['vitest.workspace.js', 'vite.config.ts', 'vitest.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
  ],
}
module.exports = config
