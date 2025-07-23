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
        credentials: TESTING_CREDENTIALS.enterprise,
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
        client.notify('testing/runInAgent', 'configuration-test-configuration-update')

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
