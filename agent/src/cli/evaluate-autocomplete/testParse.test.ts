import { describe } from 'node:test'
import { it } from 'vitest'

// TODO(olaf): tests disabled due to encountering the same issue as the one flagged for Cpp

// import { SupportedLanguage } from '../../../../vscode/src/tree-sitter/grammars'

// const tests: { language: SupportedLanguage; okText: string; errorText: string }[] = [
//     {
//         language: SupportedLanguage.TypeScript,
//         okText: 'const x = 42\n',
//         errorText: 'const x =\n',
//     },
//     {
//         language: SupportedLanguage.Go,
//         okText: 'type Person struct {\n\tName string\n}\n',
//         errorText: 'type Person struct {\n',
//     },
//     {
//         language: SupportedLanguage.Java,
//         okText: 'class Foo {}\n',
//         errorText: 'class Foo {\n',
//     },
//     {
//         language: SupportedLanguage.Python,
//         okText: 'def foo():\n    pass\n',
//         errorText: 'def foo(\n',
//     },
//     // Cpp is commented out because it fails in CI with the error
//     //    FAIL  |agent| src/cli/evaluate-autocomplete/testParse.test.ts > testParse > works for 'cpp'
//     //   CompileError: WebAssembly.instantiate(): section (code 11, "Data") extends past end of the module (length 1618416, remaining bytes 1322339) @+119449
//     // {
//     //     language: SupportedLanguage.Cpp,
//     //     okText: 'int main() {\n\treturn 0;\n}\n',
//     //     errorText: 'int main() {\n',
//     // },
//     {
//         language: SupportedLanguage.CSharp,
//         okText: 'class Foo {\n\tpublic void Bar() {}\n}\n',
//         errorText: 'class Foo {\n',
//     },
//     {
//         language: SupportedLanguage.Php,
//         okText: '<?php\nfunction foo() {\n\treturn 0;\n}\n',
//         errorText: '<?php\nfunction foo() {\n',
//     },
// ]

// describe('testParse', () => {
//     it.each(tests)('works for $language', async ({ language, okText, errorText }) => {
//         const parser = await createParser({
//             language,
//             grammarDirectory: path.resolve(__dirname, '../../../../vscode/dist'),
//         })
//         const originalTree = parser.parse(okText)
//         expect(originalTree.rootNode.hasError()).toBe(false)
//         expect(testParses(errorText, parser)).toBe(false)
//     })
// })

describe('testParse', () => {
    it('placeholder for flakey tests', () => {})
})
