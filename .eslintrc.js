// @ts-check

/** @type {import('eslint').Linter.Config} */
const config = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // 'plugin:@typescript-eslint/strict-type-checked',
    // 'plugin:@typescript-eslint/stylistic-type-checked',
    'plugin:react/recommended',
    // '@sourcegraph/eslint-config',
    'plugin:jsdoc/recommended-typescript',
    'plugin:storybook/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  root: true,
  parserOptions: {
    sourceType: 'module',
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
  rules: {
    'arrow-body-style': 'error',
    'arrow-parens': ['error', 'as-needed'],
    'callback-return': 'error',
    complexity: 'off',
    'constructor-super': 'error',
    curly: 'error',
    'dot-notation': 'error',
    eqeqeq: 'error',
    'eol-last': 'error',
    'guard-for-in': 'error',
    'linebreak-style': 'off',
    'max-classes-per-file': 'off',
    'new-parens': 'error',
    'newline-per-chained-call': 'off',
    'no-bitwise': 'off',
    'no-caller': 'error',
    'no-cond-assign': 'error',
    'no-console': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-debugger': 'error',
    'no-duplicate-imports': 'error',
    'no-empty': 'error',
    'no-else-return': ['error', { allowElseIf: false }],
    'no-eval': 'error',
    'no-extra-bind': 'error',
    'no-extra-semi': 'off',
    'no-fallthrough': 'off',
    'no-floating-decimal': 'error',
    'no-inner-declarations': 'off',
    'no-invalid-this': 'off',
    'no-irregular-whitespace': 'error',
    'no-lonely-if': 'error',
    'no-magic-numbers': 'off',
    'no-multiple-empty-lines': ['error', { max: 1 }],
    'no-new-wrappers': 'error',
    'no-redeclare': 'off',
    'no-sparse-arrays': 'error',
    'no-sync': ['error', { allowAtRootLevel: true }],
    'no-template-curly-in-string': 'error',
    'no-throw-literal': 'error',
    'no-undef-init': 'error',
    'no-unneeded-ternary': ['error', { defaultAssignment: false }],
    'no-unsafe-finally': 'error',
    'no-unused-expressions': 'error',
    'no-unused-labels': 'error',
    'no-useless-call': 'error',
    'no-useless-concat': 'error',
    'no-useless-constructor': 'off', // Crashes
    'no-var': 'error',
    'no-void': 'error',
    'object-shorthand': 'error',
    'one-var': ['error', 'never'],
    'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
    'prefer-const': ['error', { destructuring: 'all' }],
    'prefer-object-spread': 'error',
    'prefer-promise-reject-errors': 'error',
    'prefer-rest-params': 'error',
    'prefer-spread': 'error',
    'prefer-template': 'off',
    quotes: ['error', 'single', { avoidEscape: true }], // So autofixes use the right quote style
    radix: 'error',
    'require-await': 'off',
    'spaced-comment': ['error', 'always', { line: { markers: ['/'] } }], // Don't error on TypeScript triple-slash comments
    'sort-imports': 'off', // Conflicts with TypeScript and is not fully autofixable.
    'use-isnan': 'error',
    'valid-typeof': 'off',
    yoda: 'error',

    // TODO(sqs)
    'import/order': 'off',
    'id-length': 'off',

    // @typescript-eslint
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-empty-interface': 'off',
    '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
    '@typescript-eslint/no-inferrable-types': ['error', { ignoreParameters: true }],
    '@typescript-eslint/ban-types': [
      'error',
      {
        extendDefaults: true,
        types: {
          // The empty interface {} is often used for React components that accept no props,
          // which is a lot easier to understand than accepting `object` or `Record<never, never>`
          // and has no real diadvantages.
          '{}': false,
        },
      },
    ],
    '@typescript-eslint/no-extra-semi': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        varsIgnorePattern: '.*', // TS already enforces this
        args: 'after-used',
        ignoreRestSiblings: true,
      },
    ],

    // eslint-plugin-jsdoc
    'jsdoc/require-returns': 'off',
    'jsdoc/require-jsdoc': 'off',
    'jsdoc/require-param': 'off',
    'jsdoc/no-bad-blocks': 'error',
    'jsdoc/check-indentation': 'off',
    'jsdoc/check-tag-names': [
      'error',
      {
        // Used by typedoc
        definedTags: ['hidden', 'internal'],
      },
    ],

    // eslint-plugin-react
    'react/button-has-type': 'error',
    'react/display-name': 'warn',
    'react/forbid-dom-props': ['error', { forbid: ['style'] }],
    'react/jsx-boolean-value': ['error', 'always'],
    'react/jsx-curly-brace-presence': 'error',
    'react/jsx-fragments': ['error', 'syntax'],
    'react/jsx-key': 'error',
    'react/jsx-no-bind': 'off',
    'react/jsx-no-comment-textnodes': 'error',
    'react/jsx-no-target-blank': 'error',
    'react/no-access-state-in-setstate': 'error',
    'react/no-array-index-key': 'warn',
    'react/no-deprecated': 'warn',
    'react/no-did-mount-set-state': 'error',
    'react/no-did-update-set-state': 'error',
    'react/no-direct-mutation-state': 'error',
    'react/no-find-dom-node': 'error',
    'react/no-is-mounted': 'error',
    'react/no-multi-comp': ['off', { ignoreStateless: true }], // too many existing violations :/
    'react/no-redundant-should-component-update': 'error',
    'react/no-string-refs': 'error',
    'react/no-this-in-sfc': 'error',
    'react/no-typos': 'error',
    'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
    'react/no-unsafe': ['error', { checkAliases: true }],
    'react/no-unused-state': 'error',
    'react/prefer-stateless-function': ['error', { ignorePureComponents: true }],
    'react/require-render-return': 'error',
    'react/self-closing-comp': 'error',
    'react/void-dom-elements-no-children': 'error',
    'react/prop-types': 'off', // Not needed with TypeScript

    // eslint-plugin-react-hooks
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
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
