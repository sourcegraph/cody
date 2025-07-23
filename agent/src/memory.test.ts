import fs from 'node:fs'
import path from 'node:path'
import { applyPatch } from 'fast-myers-diff'
import { afterAll, beforeAll, describe, it } from 'vitest'
import * as vscode from 'vscode'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

// Disabled because we don't need to run this test in CI on every PR.  We're
// keeping the test around because it has useful infrastructure to debug memory
// leaks.
describe.skip('Memory Usage', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'memory-usage',
        credentials: TESTING_CREDENTIALS.enterprise,
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    }, 20_000)

    async function applyEvent(event: EditorEvent): Promise<void> {
        if (event.eventType === 'initialize') {
            return
        }
        if (!event.uri) {
            return
        }
        const uri = vscode.Uri.parse(event.uri)

        if (event.eventType === 'document/didOpen' || event.eventType === 'document/wasOpen') {
            const content: string = JSON.parse(event.json ?? '{}')?.content ?? ''
            await client.openFile(uri, { text: content })
            return
        }

        if (event.eventType === 'document/didClose') {
            client.notify('textDocument/didClose', { uri: event.uri })
            return
        }

        if (event.eventType === 'document/didChange') {
            const document = client.workspace.getDocument(uri)
            if (!document) {
                throw new Error(`Document ${uri} not found`)
            }
            const contentChanges: [number, number, string][] =
                JSON.parse(event.json ?? '{}')?.changes ?? []
            const newText = [...applyPatch(document.content, contentChanges)].join('')
            await client.changeFile(uri, {
                text: newText,
            })
        }
    }

    // The test case below was used to fix CODY-3616, a memory leak that
    // happened in our LRU cache for tree-sitter trees. The fix was to
    // call `tree.delete()` when it got evicted from the LRU cache.
    // Requires the following setup, which is not automated at the moment:
    // - Download a ZIP file from Cody NES recordings. For example, https://console.cloud.google.com/storage/browser/_details/cody-nes/recordings-v2/olafurpg-cody-5e3355b3-2024-08-28T10-18-11.zip;tab=live_object
    // - Unzip and you'll have a directory of CSV files
    // - Convert those CSV files into JSON with the Cody NES CLI tool. In the sourcegraph/cody-nes repo, run:
    //
    //     tsx src/cli/command-root.ts convert-to-json --dir ~/dev/sourcegraph/cody/agent/dist/replays
    //
    // - Make sure the converted JSON files are in the `agent/dist/replays` directory
    it.skip('replay', async () => {
        //
        const dir = path.join(__dirname, '..', 'dist', 'replays')
        const memory1 = await client.request('testing/memoryUsage', null)
        let remainingReplays = 2
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.json')) {
                continue
            }
            remainingReplays--
            if (remainingReplays < 0) {
                break
            }
            const absolutePath = path.join(dir, file)
            const events = parseEditorEvents(absolutePath)
            if (events.length !== 5000) {
                continue
            }
            for (const [index, event] of events.entries()) {
                await applyEvent(event)
                if (index % 50 === 0) {
                    const memory2 = await client.request('testing/memoryUsage', null)
                    console.log({
                        totalEvents: index,
                        heapUsed: prettyPrintBytes(memory2.usage.heapUsed - memory1.usage.heapUsed),
                        external: prettyPrintBytes(memory2.usage.external - memory1.usage.external),
                    })
                }
            }
        }
    }, 40_000)

    // This test case was used to fix a memory leak in the agent, which happened
    // on every text selection. The root cause was that we fired "visible text
    // documents changed" event on selection changes. After fixing the issue, we
    // still had a memory leak in the "visible text documents" event handler,
    // but it fired less frequently so the memory leak wasn't as bad.
    it.skip('selection', async () => {
        const uri = workspace.file('src', 'animal.ts')
        await client.openFile(uri)
        const document = client.workspace.getDocument(uri)!
        for (let i = 0; i < 5_000; i++) {
            client.notify('textDocument/didChange', {
                uri: document.uri.toString(),
                selection: {
                    start: { line: 0, character: 0 },
                    end: { line: 1, character: document.lineAt(1).text.length },
                },
            })
        }
        const { usage: usage1 } = await client.request('testing/memoryUsage', null)
        console.log(usage1)
        for (let i = 0; i < 40_000; i++) {
            client.notify('textDocument/didChange', {
                uri: document.uri.toString(),
                selection: {
                    start: { line: 0, character: 0 },
                    end: { line: 1, character: document.lineAt(1).text.length },
                },
            })
            await client.request('testing/awaitPendingPromises', null)
        }
        await new Promise(resolve => setTimeout(resolve, 3_000))

        const { usage: usage2 } = await client.request('testing/memoryUsage', null)
        console.log(usage2)
        console.log({
            diffHeapUsaged: prettyPrintBytes(usage2.heapUsed - usage1.heapUsed),
            diffExternal: prettyPrintBytes(usage2.external - usage1.external),
        })
    }, 20_000)
})

function prettyPrintBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let unitIndex = 0

    while (bytes >= 1024 && unitIndex < units.length - 1) {
        bytes /= 1024
        unitIndex++
    }

    return `${bytes.toFixed(2)} ${units[unitIndex]}`
}

interface EditorEvent {
    readonly timestamp: string
    readonly eventType:
        | 'initialize'
        | 'document/wasOpen'
        | 'document/didOpen'
        | 'document/didClose'
        | 'document/didSave'
        | 'document/didFocus'
        | 'document/didChange'
        | 'selection/didChange'
        | 'visibleRanges/didChange'
        | 'diagnostics/didChange'
        | 'unknown'
    readonly uri?: string
    readonly languageId?: string

    /** String-encoded JSON object of the relevant metadata.
     * For example, see SelectionInfos. */
    readonly json?: string
    recordName?: string // Intentionally mutable
}

function parseEditorEvents(file: string): EditorEvent[] {
    // Parses the output of `cody-nes convert-to-json`.
    const json: string[][] = JSON.parse(fs.readFileSync(file, 'utf8'))
    const result: EditorEvent[] = []
    for (const row of json) {
        const [timestamp, eventType, uri, languageId, json] = row
        if (timestamp === 'TIMESTAMP') {
            // header row
            continue
        }
        const event: EditorEvent = {
            timestamp,
            eventType: eventType as EditorEvent['eventType'],
            uri,
            languageId,
            json,
        }
        result.push(event)
    }
    return result
}
