import path from 'path'

import { describe, expect, it } from 'vitest'

import { SupportedLanguage } from '../../../../vscode/src/tree-sitter/grammars'
import { createParser } from '../../../../vscode/src/tree-sitter/parser'

import { testParse } from './testParse'

const tests: { language: SupportedLanguage; original: string; newText: string }[] = [
    {
        language: SupportedLanguage.TypeScript,
        original: 'const x = 42\n',
        newText: 'const x =\n',
    },
    {
        language: SupportedLanguage.Go,
        original: 'type Person struct {\n\tName string\n}\n',
        newText: 'type Person struct {\n',
    },
    {
        language: SupportedLanguage.Java,
        original: 'class Foo {}\n',
        newText: 'class Foo {\n',
    },
    {
        language: SupportedLanguage.Python,
        original: 'def foo():\n    pass\n',
        newText: 'def foo():\n',
    },
    {
        language: SupportedLanguage.Cpp,
        original: 'int main() {\n\treturn 0;\n}\n',
        newText: 'int main() {\n',
    },
    {
        language: SupportedLanguage.CSharp,
        original: 'class Foo {\n\tpublic void Bar() {}\n}\n',
        newText: 'class Foo {\n',
    },
    {
        language: SupportedLanguage.Php,
        original: '<?php\nfunction foo() {\n\treturn 0;\n}\n',
        newText: '<?php\nfunction foo() {\n',
    },
]

describe('testParse', () => {
    it.each(tests)('works for $language', async ({ language, original, newText }) => {
        const parser = await createParser({
            language,
            grammarDirectory: path.resolve(__dirname, '../../../../vscode/dist'),
        })
        const originalTree = parser.parse(original)
        expect(originalTree.rootNode.hasError()).toBe(false)
        expect(testParse(newText, parser, originalTree)).toBe(false)
    })
})
