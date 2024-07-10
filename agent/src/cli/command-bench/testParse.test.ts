import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { SupportedLanguage } from '../../../../vscode/src/tree-sitter/grammars'
import { createParser } from '../../../../vscode/src/tree-sitter/parser'

import { testParses } from './testParse'

const tests: { language: SupportedLanguage; okText: string; errorText: string }[] = [
    {
        language: SupportedLanguage.typescript,
        okText: 'const x = 42\n',
        errorText: 'const x =\n',
    },
    {
        language: SupportedLanguage.go,
        okText: 'type Person struct {\n\tName string\n}\n',
        errorText: 'type Person struct {\n',
    },
    {
        language: SupportedLanguage.java,
        okText: 'class Foo {}\n',
        errorText: 'class Foo {\n',
    },
    {
        language: SupportedLanguage.python,
        okText: 'def foo():\n    pass\n',
        errorText: 'def foo(\n',
    },
    {
        language: SupportedLanguage.cpp,
        okText: 'int main() {\n\treturn 0;\n}\n',
        errorText: 'int main() {\n',
    },
    {
        language: SupportedLanguage.csharp,
        okText: 'class Foo {\n\tpublic void Bar() {}\n}\n',
        errorText: 'class Foo {\n',
    },
    {
        language: SupportedLanguage.php,
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
