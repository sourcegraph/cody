import { describe, expect, test } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { Uri } from '../testutils/mocks'

import {
    extractDefinitionContexts,
    extractRelevantDocumentSymbolRanges,
    gatherDefinitions,
} from './GraphContextProvider'

const testFile1 = `
import fmt

class foo {
	func Foo() {
		const a = 3
		const b = 4
		return a + b
	}
}

class bar {
	func Bar(x, y) {
		const a = 3
		const b = 4
		return (a * b) + (x * y)
	}
}

// end of file
`

const testFile2 = `
import foo
import bar

const baz = new foo()
const bazbar = new bar()

// end of file
`

const testFile3 = `
import foo
import bar
import baz

/**
 * Some docstring here.
 */
func bonk() => { return new bar().Bar(new foo().Foo(), baz.Foo()) }

// end of file
`

describe('extractRelevantDocumentSymbolRanges', () => {
    test('returns all document symbol ranges by default', async () => {
        const ranges = await extractRelevantDocumentSymbolRanges([{ uri: URI.file('/test-1.test') }], () =>
            Promise.resolve([
                new vscode.Range(2, 0, 8, 1), // foo
                new vscode.Range(10, 0, 16, 1), // bar
            ])
        )

        expect(ranges).toEqual([
            new vscode.Range(2, 0, 8, 1), // foo
            new vscode.Range(10, 0, 16, 1), // bar
        ])
    })

    test('returns partial document symbol ranges with selection range', async () => {
        const ranges = await extractRelevantDocumentSymbolRanges(
            [{ uri: URI.file('/test-1.test'), range: new vscode.Range(4, 3, 5, 5) }],
            () =>
                Promise.resolve([
                    new vscode.Range(2, 0, 8, 1), // foo
                    new vscode.Range(10, 0, 16, 1), // bar
                ])
        )

        expect(ranges).toEqual([
            new vscode.Range(2, 0, 8, 1), // foo
        ])
    })
})

describe('gatherDefinitions', () => {
    test('returns definitions referencing multiple files', async () => {
        const uri = Uri.parse('/test-3.test')
        const definitions = await gatherDefinitions(
            uri,
            [
                new vscode.Range(4, 0, 7, 67), // bonk
            ],
            new Map([[uri.fsPath, testFile3.split('\n').slice(1)]]),
            // eslint-disable-next-line @typescript-eslint/require-await
            async (uri: URI, position: vscode.Position): Promise<vscode.Location[]> => {
                switch (position.character) {
                    case 6:
                        return [{ uri: Uri.file('/test-3.test'), range: new vscode.Range(7, 5, 7, 7) }]
                    case 29: // bar
                        return [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(10, 6, 10, 9) }]
                    case 35: // Bar
                        return [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(11, 6, 11, 9) }]
                    case 43: // foo
                        return [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(2, 6, 2, 9) }]
                    case 49: // Foo
                        return [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(3, 6, 3, 9) }]
                    case 56: // baz
                        return [{ uri: Uri.file('/test-2.test'), range: new vscode.Range(3, 6, 3, 8) }]
                    case 60: // Foo
                        return [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(3, 6, 3, 9) }]
                }

                return []
            }
        )

        expect(definitions).toEqual([
            { symbolName: 'Some', locations: [] },
            { symbolName: 'docstring', locations: [] },
            { symbolName: 'here', locations: [] },
            { symbolName: 'bonk', locations: [{ uri: Uri.file('/test-3.test'), range: new vscode.Range(7, 5, 7, 7) }] },
            {
                symbolName: 'bar',
                locations: [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(10, 6, 10, 9) }],
            },
            {
                symbolName: 'Bar',
                locations: [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(11, 6, 11, 9) }],
            },
            { symbolName: 'foo', locations: [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(2, 6, 2, 9) }] },
            { symbolName: 'Foo', locations: [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(3, 6, 3, 9) }] },
            { symbolName: 'baz', locations: [{ uri: Uri.file('/test-2.test'), range: new vscode.Range(3, 6, 3, 8) }] },
            { symbolName: 'Foo', locations: [{ uri: Uri.file('/test-1.test'), range: new vscode.Range(3, 6, 3, 9) }] },
        ])
    })
})

describe('extractDefinitionContexts', () => {
    test('returns extracted definitions from multiple files', async () => {
        const contexts = await extractDefinitionContexts(
            [
                {
                    symbolName: 'foo',
                    location: { uri: Uri.file('/test-1.test'), range: new vscode.Range(2, 6, 2, 9) },
                },
                {
                    symbolName: 'bar',
                    location: { uri: Uri.file('/test-1.test'), range: new vscode.Range(10, 6, 10, 9) },
                },
                {
                    symbolName: 'baz',
                    location: { uri: Uri.file('/test-2.test'), range: new vscode.Range(3, 6, 3, 8) },
                },
                {
                    symbolName: 'bonk',
                    location: { uri: Uri.file('/test-3.test'), range: new vscode.Range(7, 5, 7, 7) },
                },
            ],
            new Map<string, string[]>([
                ['/test-1.test', testFile1.split('\n').slice(1)], // foo, bar
                ['/test-2.test', testFile2.split('\n').slice(1)], // baz
                ['/test-3.test', testFile3.split('\n').slice(1)], // bonk
            ]),
            (uri: URI): Promise<vscode.Range[]> => {
                switch (uri.fsPath) {
                    case '/test-1.test':
                        return Promise.resolve([
                            new vscode.Range(2, 0, 8, 1), // foo
                            new vscode.Range(10, 0, 16, 1), // bar
                        ])

                    case '/test-2.test':
                        return Promise.resolve([
                            new vscode.Range(3, 0, 3, 20), // baz
                        ])

                    case '/test-3.test':
                        return Promise.resolve([
                            new vscode.Range(4, 0, 7, 67), // bonk
                        ])
                }

                return Promise.resolve([])
            }
        )

        expect(contexts).toEqual([
            {
                symbol: { fuzzyName: 'foo' },
                filePath: '/test-1.test',
                definitionSnippet:
                    'class foo {\n\tfunc Foo() {\n\t\tconst a = 3\n\t\tconst b = 4\n\t\treturn a + b\n\t}\n}',
                range: { startLine: 2, startCharacter: 6, endLine: 2, endCharacter: 9 },
            },
            {
                symbol: { fuzzyName: 'bar' },
                filePath: '/test-1.test',
                definitionSnippet:
                    'class bar {\n\tfunc Bar(x, y) {\n\t\tconst a = 3\n\t\tconst b = 4\n\t\treturn (a * b) + (x * y)\n\t}\n}',
                range: { startLine: 10, startCharacter: 6, endLine: 10, endCharacter: 9 },
            },
            {
                symbol: { fuzzyName: 'baz' },
                filePath: '/test-2.test',
                definitionSnippet: 'const baz = new foo()',
                range: { startLine: 3, startCharacter: 6, endLine: 3, endCharacter: 8 },
            },
            {
                symbol: { fuzzyName: 'bonk' },
                filePath: '/test-3.test',
                definitionSnippet:
                    '/**\n * Some docstring here.\n */\nfunc bonk() => { return new bar().Bar(new foo().Foo(), baz.Foo()) }',
                range: { startLine: 7, startCharacter: 5, endLine: 7, endCharacter: 7 },
            },
        ])
    })
})
