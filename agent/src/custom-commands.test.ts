import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { explainPollyError } from './explainPollyError'
import type { CustomChatCommandResult, CustomEditCommandResult } from './protocol-alias'
import { trimEndOfLine } from './trimEndOfLine'

describe('Custom Commands', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'custom-commands'))
    const animalUri = workspace.file('src', 'animal.ts')
    const sumUri = workspace.file('src', 'sum.ts')
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'customCommandsClient',
        credentials: TESTING_CREDENTIALS.enterprise,
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
        await client.request('command/execute', { command: 'cody.search.index-update' })
        const customCommands = await client.request('customCommands/list', null)
        // The number of custom commands we are testing
        const expectedCommands = 5
        expect(customCommands.length).toBeGreaterThan(expectedCommands)
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    // Note: needs to be the first test case so that we can control over
    // what tabs are open here.
    it('commands/custom, chat command, open tabs context', async () => {
        const uri = workspace.file('src', 'example1.ts')
        await client.openFile(workspace.file('src', 'example2.ts'))
        await client.openFile(workspace.file('src', 'example3.ts'))
        await client.openFile(uri)

        const result = (await client.request('commands/custom', {
            key: '/countTabs',
        })) as CustomChatCommandResult
        expect(result.type).toBe('chat')
        const lastMessage = await client.firstNonEmptyTranscript(result?.chatResult as string)
        expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchSnapshot()
    }, 30_000)

    // CODY-1766: disabled because the generated output is too unstable
    it.skip('commands/custom, chat command, adds argument', async () => {
        await client.openFile(animalUri)
        const result = (await client.request('commands/custom', {
            key: '/translate Python',
        })) as CustomChatCommandResult
        expect(result.type).toBe('chat')
        const lastMessage = await client.firstNonEmptyTranscript(result?.chatResult as string)
        expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchSnapshot()
    }, 30_000)

    it('commands/custom, chat command, no context', async () => {
        await client.openFile(animalUri)
        const result = (await client.request('commands/custom', {
            key: '/none',
        })) as CustomChatCommandResult
        expect(result.type).toBe('chat')
        const lastMessage = await client.firstNonEmptyTranscript(result.chatResult as string)
        expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
            `"no"`,
            explainPollyError
        )
    }, 30_000)

    // The context files are presented in an order in the CI that is different
    // than the order shown in recordings when on Windows, causing it to fail.
    it('commands/custom, chat command, current directory context', async () => {
        await client.openFile(animalUri)
        const result = (await client.request('commands/custom', {
            key: '/countDirFiles',
        })) as CustomChatCommandResult
        expect(result.type).toBe('chat')
        const lastMessage = await client.firstNonEmptyTranscript(result.chatResult as string)
        const reply = trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')
        expect(reply).toMatchInlineSnapshot(`"6"`, explainPollyError)
    }, 30_000)

    it('commands/custom, edit command, insert mode', async () => {
        await client.openFile(sumUri, { removeCursor: false })
        const result = (await client.request('commands/custom', {
            key: '/hello',
        })) as CustomEditCommandResult
        expect(result.type).toBe('edit')
        await client.acceptLensWasShown(sumUri)

        const originalDocument = client.workspace.getDocument(sumUri)!
        expect(trimEndOfLine(originalDocument.getText())).toMatchSnapshot()
    }, 30_000)

    it('commands/custom, edit command, edit mode', async () => {
        await client.openFile(animalUri)

        const result = (await client.request('commands/custom', {
            key: '/newField',
        })) as CustomEditCommandResult
        expect(result.type).toBe('edit')
        await client.acceptLensWasShown(animalUri)

        const originalDocument = client.workspace.getDocument(animalUri)!
        expect(trimEndOfLine(originalDocument.getText())).toMatchSnapshot()
    }, 30_000)
})
