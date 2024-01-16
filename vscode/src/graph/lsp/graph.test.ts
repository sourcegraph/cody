import { describe, expect, test } from 'vitest'
import * as vscode from 'vscode'
import { type URI } from 'vscode-uri'

import { testFileUri } from '@sourcegraph/cody-shared'

import {
    extractDefinitionContexts,
    extractRelevantDocumentSymbolRanges,
    gatherDefinitionRequestCandidates,
    gatherDefinitions,
} from './graph'

const testFile1Uri = testFileUri('test-1.test')
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

const testFile2Uri = testFileUri('test-2.test')
const testFile2 = `
import foo
import bar

const baz = new foo()
const bazbar = new bar()

// end of file
`

const testFile3Uri = testFileUri('test-3.test')
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
        const uri = testFile1Uri
        const ranges = await extractRelevantDocumentSymbolRanges([{ uri }], () =>
            Promise.resolve([
                new vscode.Range(2, 0, 8, 1), // foo
                new vscode.Range(10, 0, 16, 1), // bar
            ])
        )

        expect(ranges.map(({ uri, range }) => ({ uri: uri.fsPath, range }))).toEqual([
            { uri: uri.fsPath, range: new vscode.Range(2, 0, 8, 1) }, // foo
            { uri: uri.fsPath, range: new vscode.Range(10, 0, 16, 1) }, // bar
        ])
    })

    test('returns partial document symbol ranges with selection range', async () => {
        const uri = testFile1Uri
        const ranges = await extractRelevantDocumentSymbolRanges([{ uri, range: new vscode.Range(4, 3, 5, 5) }], () =>
            Promise.resolve([
                new vscode.Range(2, 0, 8, 1), // foo
                new vscode.Range(10, 0, 16, 1), // bar
            ])
        )

        expect(ranges.map(({ uri, range }) => ({ uri: uri.fsPath, range }))).toEqual([
            { uri: uri.fsPath, range: new vscode.Range(2, 0, 8, 1) }, // foo
        ])
    })
})

describe('gatherDefinitions', () => {
    test('returns definitions referencing multiple files', async () => {
        const uri = testFile3Uri
        const selections = [
            {
                uri,
                range: new vscode.Range(4, 0, 7, 67), // bonk
            },
        ]

        const requests = gatherDefinitionRequestCandidates(
            selections,
            new Map([[uri.fsPath, testFile3.split('\n').slice(1)]])
        )
        const getHover = (): Promise<vscode.Hover[]> => Promise.resolve([])
        // eslint-disable-next-line @typescript-eslint/require-await
        const getDefinitions = async (uri: URI, position: vscode.Position): Promise<vscode.Location[]> => {
            switch (position.character) {
                case 6:
                    return [{ uri: testFile3Uri, range: new vscode.Range(7, 5, 7, 7) }]
                case 29: // bar
                    return [{ uri: testFile1Uri, range: new vscode.Range(10, 6, 10, 9) }]
                case 35: // Bar
                    return [{ uri: testFile1Uri, range: new vscode.Range(11, 6, 11, 9) }]
                case 43: // foo
                    return [{ uri: testFile1Uri, range: new vscode.Range(2, 6, 2, 9) }]
                case 49: // Foo
                    return [{ uri: testFile1Uri, range: new vscode.Range(3, 6, 3, 9) }]
                case 56: // baz
                    return [{ uri: testFile2Uri, range: new vscode.Range(3, 6, 3, 8) }]
                case 60: // Foo
                    return [{ uri: testFile1Uri, range: new vscode.Range(3, 6, 3, 9) }]
            }

            return []
        }
        const getTypeDefinitions = (): Promise<vscode.Location[]> => Promise.resolve([])
        const getImplementations = (): Promise<vscode.Location[]> => Promise.resolve([])

        const definitions = await gatherDefinitions(
            selections,
            requests,
            getHover,
            getDefinitions,
            getTypeDefinitions,
            getImplementations
        )

        // Use URI.toString() to avoid comparing non-public properties of the `URI` class.
        const definitionsWithStringURI = definitions.map(definition => ({
            ...definition,
            definitionLocations: definition.definitionLocations.map(location => ({
                ...location,
                uri: location.uri.toString(),
            })),
        }))

        expect(definitionsWithStringURI).toEqual([
            // Empty locations are pruned
            // { symbolName: 'Some', locations: [] },
            // { symbolName: 'docstring', locations: [] },
            // { symbolName: 'here', locations: [] },

            // Definitions within input selection are pruned
            // { symbolName: 'bonk', locations: [{ uri: testFile3Uri, range: new vscode.Range(7, 5, 7, 7) }] },

            {
                symbolName: 'bar',
                hover: [],
                definitionLocations: [{ uri: testFile1Uri.toString(), range: new vscode.Range(10, 6, 10, 9) }],
                typeDefinitionLocations: [],
                implementationLocations: [],
            },
            {
                symbolName: 'Bar',
                hover: [],
                definitionLocations: [{ uri: testFile1Uri.toString(), range: new vscode.Range(11, 6, 11, 9) }],
                typeDefinitionLocations: [],
                implementationLocations: [],
            },
            {
                symbolName: 'foo',
                hover: [],
                definitionLocations: [{ uri: testFile1Uri.toString(), range: new vscode.Range(2, 6, 2, 9) }],
                typeDefinitionLocations: [],
                implementationLocations: [],
            },
            {
                symbolName: 'Foo',
                hover: [],
                definitionLocations: [{ uri: testFile1Uri.toString(), range: new vscode.Range(3, 6, 3, 9) }],
                typeDefinitionLocations: [],
                implementationLocations: [],
            },
            {
                symbolName: 'baz',
                hover: [],
                definitionLocations: [{ uri: testFile2Uri.toString(), range: new vscode.Range(3, 6, 3, 8) }],
                typeDefinitionLocations: [],
                implementationLocations: [],
            },

            // Duplicates are thrown out
            // {
            //     symbolName: 'Foo',
            //     hover: [],
            //     locations: [{ uri: testFile1Uri, range: new vscode.Range(3, 6, 3, 9) }],
            // },
        ])
    })
})

describe('extractDefinitionContexts', () => {
    test('returns extracted definitions from multiple files', async () => {
        const contexts = await extractDefinitionContexts(
            [
                {
                    symbolName: 'foo',
                    hover: [],
                    location: { uri: testFile1Uri, range: new vscode.Range(2, 6, 2, 9) },
                },
                {
                    symbolName: 'bar',
                    hover: [],
                    location: { uri: testFile1Uri, range: new vscode.Range(10, 6, 10, 9) },
                },
                {
                    symbolName: 'baz',
                    hover: [],
                    location: { uri: testFile2Uri, range: new vscode.Range(3, 6, 3, 8) },
                },
                {
                    symbolName: 'bonk',
                    hover: [],
                    location: { uri: testFile3Uri, range: new vscode.Range(7, 5, 7, 7) },
                },
            ],
            new Map<string, string[]>([
                [testFile1Uri.fsPath, testFile1.split('\n').slice(1)], // foo, bar
                [testFile2Uri.fsPath, testFile2.split('\n').slice(1)], // baz
                [testFile3Uri.fsPath, testFile3.split('\n').slice(1)], // bonk
            ]),
            (uri: URI): Promise<vscode.Range[]> => {
                switch (uri.fsPath) {
                    case testFile1Uri.fsPath:
                        return Promise.resolve([
                            new vscode.Range(2, 0, 8, 1), // foo
                            new vscode.Range(10, 0, 16, 1), // bar
                        ])

                    case testFile2Uri.fsPath:
                        return Promise.resolve([
                            new vscode.Range(3, 0, 3, 20), // baz
                        ])

                    case testFile3Uri.fsPath:
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
                filePath: testFile1Uri.fsPath,
                hoverText: [],
                definitionSnippet:
                    'class foo {\n\tfunc Foo() {\n\t\tconst a = 3\n\t\tconst b = 4\n\t\treturn a + b\n\t}\n}',
                range: { startLine: 2, startCharacter: 6, endLine: 2, endCharacter: 9 },
            },
            {
                symbol: { fuzzyName: 'bar' },
                filePath: testFile1Uri.fsPath,
                hoverText: [],
                definitionSnippet:
                    'class bar {\n\tfunc Bar(x, y) {\n\t\tconst a = 3\n\t\tconst b = 4\n\t\treturn (a * b) + (x * y)\n\t}\n}',
                range: { startLine: 10, startCharacter: 6, endLine: 10, endCharacter: 9 },
            },
            {
                symbol: { fuzzyName: 'baz' },
                filePath: testFile2Uri.fsPath,
                hoverText: [],
                definitionSnippet: 'const baz = new foo()',
                range: { startLine: 3, startCharacter: 6, endLine: 3, endCharacter: 8 },
            },
            {
                symbol: { fuzzyName: 'bonk' },
                filePath: testFile3Uri.fsPath,
                hoverText: [],
                definitionSnippet:
                    '/**\n * Some docstring here.\n */\nfunc bonk() => { return new bar().Bar(new foo().Foo(), baz.Foo()) }',
                range: { startLine: 7, startCharacter: 5, endLine: 7, endCharacter: 7 },
            },
        ])
    })
})
