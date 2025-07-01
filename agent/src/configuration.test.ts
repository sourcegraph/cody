import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import * as vscode from './vscode-shim'

describe('Configuration', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'configuration',
        credentials: TESTING_CREDENTIALS.dotcom,
        capabilities: {
            autoedit: 'none'
        }
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
        const configuration = vscode.workspace.getConfiguration()
        await configuration.update('cody.dummy.setting', 'random')

        await new Promise(resolve => setTimeout(resolve, 5000));

        expect(client.extensionConfigurationUpdates.length).toBe(1)
        expect(client.extensionConfigurationUpdates[0]).toBe({
            key: 'cody.dummy.setting',
            value: 'random',
        })
    }, 10_000_000)
})
