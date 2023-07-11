// @ts-check

/** @type {import('eslint').Linter.Config} */
const config = {
  extends: ['@sourcegraph/eslint-config', 'plugin:storybook/recommended'],
  root: true,
  parserOptions: {
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    EXPERIMENTAL_useSourceOfProjectReferenceRedirect: true,
    project: [
      'agent/tsconfig.json',
      'cli/tsconfig.json',
      'lib/ui/tsconfig.json',
      'lib/shared/tsconfig.json',
      'slack/tsconfig.json',
      'vscode/tsconfig.json',
      'vscode/test/integration/tsconfig.json',
      'vscode/scripts/tsconfig.json',
      'web/tsconfig.json',
      'tsconfig.json',
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
    {
      files: ['*.js'],
      env: {
        commonjs: true,
      },
    },
  ],
}
module.exports = config
