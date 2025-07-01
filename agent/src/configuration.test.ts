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

        // Ideally that should be active waiting so we don't defensively spent time in test on sleeps. You can check if client.extensionConfigurationUpdates.length > 0 in the loop few times, each time sleeping if it is not ready yet. If it still wont be ready after that expect(client.extensionConfigurationUpdates.length).toBeGreaterThan(0) will fail anyway.
        for (let i = 0; i < 10; i++) {
            if (client.extensionConfigurationUpdates.length > 0) {
                break
            }
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        expect(client.extensionConfigurationUpdates.length).toBeGreaterThan(0)

        expect(client.extensionConfigurationUpdates).toContainEqual({
            key: 'cody.dummy.setting',
            value: 'random',
        })
    }, 30_000)
})
