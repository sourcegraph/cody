// The goal of this file is to document the steps to run Cody with all services locally.
import path from 'node:path'
import process from 'node:process'
import { ModelsService, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

interface SGParams {
    serverEndpoint: string
    accessToken: string
}

class SG {
    public async connect(): Promise<SGParams> {
        return new Promise((resolve, reject) => {
            const endpoint = process.env.LOCAL_SG_ENDPOINT ?? 'https://sourcegraph.test:3443'
            const accessToken = process.env.LOCAL_SG_ACCESS_TOKEN ?? ''

            if (endpoint == '') {
                reject("must define an endpoint")
            }

            if (accessToken == '') {
                reject("must define an access token")
            }

            const params: SGParams = {
                serverEndpoint: endpoint,
                accessToken: accessToken
            }

            resolve(params)
        })
    }
}

describe('E2E-local', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: path.basename(__filename),
        credentials: TESTING_CREDENTIALS.dotcom,
    })
    const sg = new SG()

    beforeAll(async () => {
        console.error("before all")
        const params = await sg.connect()
        ModelsService.setModels(getDotComDefaultModels())
        await workspace.beforeAll()
        await client.beforeAll(params)
        await client.request('command/execute', { command: 'cody.search.index-update' })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('editCommands/code (basic function)', async () => {
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
    })
})
