import path from 'path'

import { describe, expect, it } from 'vitest'

import { SupportedLanguage } from '../../../../vscode/src/tree-sitter/grammars'
import { createParser } from '../../../../vscode/src/tree-sitter/parser'

import { testParses } from './testParse'

const tests: { language: SupportedLanguage; okText: string; errorText: string }[] = [
    {
        language: SupportedLanguage.TypeScript,
        okText: 'const x = 42\n',
        errorText: 'const x =\n',
    },
    {
        language: SupportedLanguage.Go,
        okText: 'type Person struct {\n\tName string\n}\n',
        errorText: 'type Person struct {\n',
    },
    {
        language: SupportedLanguage.Java,
        okText: 'class Foo {}\n',
        errorText: 'class Foo {\n',
    },
    {
        language: SupportedLanguage.Python,
        okText: 'def foo():\n    pass\n',
        errorText: 'def foo(\n',
    },
    {
        language: SupportedLanguage.Cpp,
        okText: 'int main() {\n\treturn 0;\n}\n',
        errorText: 'int main() {\n',
    },
    {
        language: SupportedLanguage.CSharp,
        okText: 'class Foo {\n\tpublic void Bar() {}\n}\n',
        errorText: 'class Foo {\n',
    },
    {
        language: SupportedLanguage.Php,
        okText: '<?php\nfunction foo() {\n\treturn 0;\n}\n',
        errorText: '<?php\nfunction foo() {\n',
    },
]

describe('testParse', () => {
    it.each(tests)('works for $language', async ({ language, okText, errorText }) => {
        const parser = await createParser({
            language,
            grammarDirectory: path.resolve(__dirname, '../../../../vscode/dist'),
        })
        if (!parser) {
            throw new TypeError(`parser is undefined for language ${language}`)
        }
        const originalTree = parser.parse(okText)
        expect(originalTree.rootNode.hasError()).toBe(false)
        expect(testParses(errorText, parser)).toBe(false)
    })
})
