import { type ChildProcess, spawn } from 'node:child_process'
// The goal of this file is to document the steps to run Cody with all services locally.
import path from 'node:path'
import { ModelsService, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

describe('E2E-local', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: path.basename(__filename),
        credentials: TESTING_CREDENTIALS.dotcom,
    })
    let sgStartProcess: ChildProcess

    beforeAll(async () => {
        sgStartProcess = spawn('sg', ['start'], { stdio: 'inherit' })
        ModelsService.setModels(getDotComDefaultModels())
        await workspace.beforeAll()
        await client.beforeAll()
        await client.request('command/execute', { command: 'cody.search.index-update' })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
        sgStartProcess.kill()
    })

    it('editCommands/code (basic function)', async () => {
        console.log(path.basename(__filename))
    })
})
