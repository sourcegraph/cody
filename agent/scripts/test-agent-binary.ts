/**
 * This file is intended as a playground if you need to interact with the agent
 * single binary build.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as vscode from 'vscode'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from '../src/TestClient'
import { TestWorkspace } from '../src/TestWorkspace'

async function main() {
    if (!process.env.SRC_ACCESS_TOKEN) {
        console.log('SRC_ACCESS_TOKEN is not defined')
        process.exit(1)
    }

    const prototypePath = path.join(__dirname, '..', 'src', '__tests__', 'example-ts')
    const workspaceRootUri = vscode.Uri.file(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
    const workspaceRootPath = workspaceRootUri.fsPath
    const sumPath = path.join(workspaceRootPath, 'src', 'sum.ts')
    const sumUri = vscode.Uri.file(sumPath)

    await fs.mkdir(workspaceRootPath, { recursive: true })
    await fs.cp(prototypePath, workspaceRootPath, {
        recursive: true,
    })

    const osArch = getOSArch()
    const workspace = new TestWorkspace(prototypePath)
    const credentials = TESTING_CREDENTIALS.enterprise

    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'defaultClient',
        bin: './dist/agent-' + osArch,
        credentials: credentials,
    })

    await client.initialize({})

    const valid = await client.request('extensionConfiguration/change', {
        ...client.info.extensionConfiguration,
        anonymousUserID: 'abcde1234',
        accessToken: credentials.token!,
        serverEndpoint: credentials.serverEndpoint,
        customHeaders: {},
    })

    if (valid?.status !== 'authenticated') {
        throw new Error('Failed to authenticate')
    }

    await client.openFile(sumUri)
    const doc = client.workspace.getDocument(sumUri)
    if (!doc) {
        throw new Error('Failed to open document')
    }

    // Wait some time so that WASM can init
    await new Promise(resolve => setTimeout(resolve, 3000))

    const completions = await client.request('autocomplete/execute', {
        uri: sumUri.toString(),
        position: { line: 1, character: 3 },
        triggerKind: 'Invoke',
    })
    console.log('Successfully ran an autocomplete!')
    console.log(completions)

    client.exit()
    process.exit(0)
}

main().catch(console.error)

// Supported agent builds:
//
// - agent-linux-arm64
// - agent-linux-x64
// - agent-macos-arm64
// - agent-macos-x64
// - agent-win-x64.exe
function getOSArch(): string {
    const platform = os.platform()
    const arch = os.arch()

    const nodePlatformToPlatform: { [key: string]: string } = {
        darwin: 'macos',
        linux: 'linux',
        win32: 'win',
    }
    const nodeMachineToArch: { [key: string]: string } = {
        arm64: 'arm64',
        aarch64: 'arm64',
        x86_64: 'x64',
        x64: 'x64',
    }

    const platformName = nodePlatformToPlatform[platform]
    const archName = nodeMachineToArch[arch]

    if (!platformName || !archName) {
        throw new Error(`Unsupported platform: ${platform} ${arch}`)
    }

    return `${platformName}-${archName}` + (platform === 'win32' ? '.exe' : '')
}
