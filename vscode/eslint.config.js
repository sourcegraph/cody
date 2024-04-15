// @ts-check

const tslint = require('typescript-eslint')

module.exports = {
    languageOptions: {
        parser: tslint.parser,
        parserOptions: {
            project: ['tsconfig.json'],
        },
    },
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/tree-sitter/**'],
    plugins: {
        '@typescript-eslint': tslint.plugin,
    },
    rules: {
        '@typescript-eslint/strict-boolean-expressions': ['error', {
            allowString: false,
            allowNumber: true,
            allowNullableObject: true,
            allowNullableBoolean: true,
            allowNullableString: true,
            allowNullableNumber: true,
            allowNullableEnum: true,
            allowAny: true,
            allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing: true,
        }],
    },
}
