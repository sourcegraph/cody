/**
 * This file is intended as a playground if you need to interact with the agent
 * single binary build.
 */

import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import * as vscode from 'vscode'
import { TestClient } from '../src/TestClient'

async function main() {
    if (!process.env.SRC_ACCESS_TOKEN) {
        console.log('SRC_ACCESS_TOKEN is not defined')
        process.exit(1)
    }
    const accessToken = process.env.SRC_ACCESS_TOKEN
    const serverEndpoint = process.env.SRC_ENDPOINT ?? 'https://sourcegraph.com'

    const prototypePath = path.join(__dirname, '..', 'src', '__tests__', 'example-ts')
    const workspaceRootUri = vscode.Uri.file(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
    const workspaceRootPath = workspaceRootUri.fsPath
    const sumPath = path.join(workspaceRootPath, 'src', 'sum.ts')
    const sumUri = vscode.Uri.file(sumPath)

    await fs.mkdir(workspaceRootPath, { recursive: true })
    await fs.cp(prototypePath, workspaceRootPath, {
        recursive: true,
    })

    const client = new TestClient(
        {
            name: 'defaultClient',
            accessToken,
        },
        './dist/agent-macos-arm64'
    )

    await client.initialize({
        serverEndpoint: serverEndpoint,
        accessToken,
    })

    const valid = await client.request('extensionConfiguration/change', {
        ...client.info.extensionConfiguration,
        anonymousUserID: 'abcde1234',
        accessToken,
        serverEndpoint: serverEndpoint,
        customHeaders: {},
    })

    if (!valid?.authenticated) {
        throw new Error('Failed to authenticate')
    }

    await client.openFile(sumUri)
    const doc = client.workspace.getDocument(sumUri)
    if (!doc) {
        throw new Error('Failed to open document')
    }

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
