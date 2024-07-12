// The goal of this file is to document the steps to run Cody with all services locally.
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TestClient } from '../TestClient'
import { TestWorkspace } from '../TestWorkspace'
import { LocalSGInstance, isLocal } from './helpers'

describe.runIf(isLocal)('E2E-local', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '..', '__tests__', 'example-ts'))
    let client: TestClient
    const sg = new LocalSGInstance()

    beforeAll(async () => {
        await workspace.beforeAll()
        await sg.beforeAll()

        client = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: path.basename(__filename),
            credentials: sg.getCredentials(),
        })

        await client.beforeAll(sg.getParams())
        await client.request('command/execute', { command: 'cody.search.index-update' })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('is an example test performing an explain command against a locally running instance', async () => {
        const animalUri = workspace.file('src', 'animal.ts')

        await client.openFile(animalUri)
        const freshChatID = await client.request('chat/new', null)
        const id = await client.request('commands/explain', null)

        // Assert that the server is not using IDs between `chat/new` and
        // `chat/explain`. In VS Code, we try to reuse empty webview panels,
        // which is undesireable for agent clients.
        expect(id).not.toStrictEqual(freshChatID)

        const lastMessage = await client.firstNonEmptyTranscript(id)
        console.log(lastMessage)
        for (const m of lastMessage.messages) {
            console.log(m)
        }
    }, 200_000) // We're making full roundtrips, so we need to increase the default timeout.
})
