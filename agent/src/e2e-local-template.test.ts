import { type ChildProcess, spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import fspromises from 'node:fs/promises'
// The goal of this file is to document the steps to run Cody with all services locally.
import path from 'node:path'
import { ModelsService, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

interface SGParams {
    serverEndpoint: string
    accessToken: string
}

class SG {
    sgStartProcess: ChildProcess | undefined
    constructor(private params: { logsPath: string; sourcegraphDir: string }) {}
    private static serverStarted(process: ChildProcess): Promise<SGParams> {
        return new Promise((resolve, reject) => {
            process.stdout?.on('data', data => {
                // TODO: parse out the URL, use GQL to get an access token
                console.log({ data: data.toString() })
            })
            setTimeout(() => reject(new Error('timeout')), 2_000)
        })
    }
    public async start(): Promise<SGParams> {
        this.sgStartProcess = spawn('sg', ['start'], { cwd: this.params.sourcegraphDir })
        await fspromises.rm(this.params.logsPath, { force: true })
        // We intentionally use writeFileSync because that seems to work best with `tail -f`
        this.sgStartProcess.stderr?.on('data', data => writeFileSync(this.params.logsPath, data))
        this.sgStartProcess.stdout?.on('data', data => writeFileSync(this.params.logsPath, data))
        return await SG.serverStarted(this.sgStartProcess)
    }
    public stop(): void {
        this.sgStartProcess?.kill()
    }
}

describe('E2E-local', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: path.basename(__filename),
        credentials: TESTING_CREDENTIALS.dotcom,
    })
    const sg = new SG({
        logsPath: path.join(process.cwd(), 'dist', 'sg-logs.txt'),
        sourcegraphDir: path.join(path.dirname(process.cwd()), 'sourcegraph'),
    })

    beforeAll(async () => {
        const params = await sg.start()
        ModelsService.setModels(getDotComDefaultModels())
        await workspace.beforeAll()
        await client.beforeAll(params)
        await client.request('command/execute', { command: 'cody.search.index-update' })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
        console.log('killing sg start')
        sg.stop()
    })

    it('editCommands/code (basic function)', async () => {
        console.log(path.basename(__filename))
    })
})
