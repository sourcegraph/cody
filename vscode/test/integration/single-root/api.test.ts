import * as assert from 'assert'

import * as vscode from 'vscode'

import { VSCodeDocumentHistory } from '../../../src/completions/context/retrievers/jaccard-similarity/history'

import { testFileUri } from '../helpers'

suite('API tests', () => {
    test('Cody registers some commands', async () => {
        const commands = await vscode.commands.getCommands(true)
        const codyCommands = commands.filter(command => command.includes('cody.'))
        assert.ok(codyCommands.length)
    })

    test('History', () => {
        const h = new VSCodeDocumentHistory(() => null)
        h.addItem({
            document: {
                uri: testFileUri('foo.ts'),
                languageId: 'ts',
            },
        })
        h.addItem({
            document: {
                uri: testFileUri('bar.ts'),
                languageId: 'ts',
            },
        })
        h.addItem({
            document: {
                uri: testFileUri('foo.ts'),
                languageId: 'ts',
            },
        })
        assert.deepStrictEqual(
            h.lastN(20).map(h => h.document.uri.toString()),
            [testFileUri('foo.ts').toString(), testFileUri('bar.ts').toString()]
        )
    })
})
