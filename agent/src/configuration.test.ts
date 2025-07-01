import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

describe('Configuration', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'configuration',
        credentials: TESTING_CREDENTIALS.dotcom,
        extraConfiguration: {
            'cody.suggestions.mode': 'autocomplete',
        },
        capabilities: {
            autoedit: 'none',
        },
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('extensionConfiguration/didUpdate', async () => {
        // Use the testing notification to trigger configuration update in the agent process
        client.notify('testing/runInAgent', 'configuration-test-configuration-update')

        await new Promise(resolve => setTimeout(resolve, 1000))

        expect(client.extensionConfigurationUpdates.length).toBeGreaterThan(0)

        // Find our specific configuration update
        const ourUpdate = client.extensionConfigurationUpdates.find(
            update => update.key === 'cody.dummy.setting'
        )
        expect(ourUpdate).toBeDefined()
        expect(ourUpdate).toEqual({
            key: 'cody.dummy.setting',
            value: 'random',
        })
    }, 30_000)
})
