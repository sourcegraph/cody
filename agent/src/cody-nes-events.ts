import fs from 'node:fs'
import { applyPatch } from 'fast-myers-diff'
import * as vscode from 'vscode'
import type { RpcMessageHandler } from '../../vscode/src/jsonrpc/jsonrpc'
import type { TestClient } from './TestClient'

export interface EditorEvent {
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

export function parseEditorEvents(file: string): EditorEvent[] {
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

export async function applyEvent(client: TestClient, event: EditorEvent): Promise<void> {
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
        const contentChanges: [number, number, string][] = JSON.parse(event.json ?? '{}')?.changes ?? []
        const newText = [...applyPatch(document.content, contentChanges)].join('')
        await client.changeFile(uri, {
            text: newText,
        })
    }
}

export async function applyEventForRPCClient(
    client: RpcMessageHandler,
    event: EditorEvent
): Promise<void> {
    if (event.eventType === 'initialize') {
        return
    }
    if (!event.uri) {
        return
    }
    const uri = vscode.Uri.parse(event.uri)

    if (event.eventType === 'document/didOpen' || event.eventType === 'document/wasOpen') {
        const content: string = JSON.parse(event.json ?? '{}')?.content ?? ''
        client.notify('textDocument/didOpen', { uri: uri.toString(), content })
        return
    }

    if (event.eventType === 'document/didClose') {
        client.notify('textDocument/didClose', { uri: event.uri })
        return
    }

    if (event.eventType === 'document/didChange') {
        const uri = vscode.Uri.file(event.uri)
        const documentList = (
            await client.request('testing/workspaceDocuments', {
                uris: [event.uri],
            })
        ).documents
        if (documentList.length !== 1) {
            throw new Error(`Document ${uri} not found`)
        }
        const document = documentList[0]
        const content = document.content
        if (!content) {
            throw new Error(`Document ${uri} not found`)
        }
        const contentChanges: [number, number, string][] = JSON.parse(event.json ?? '{}')?.changes ?? []
        const newText = [...applyPatch(content, contentChanges)].join('')
        client.notify('textDocument/didChange', {
            uri: uri.toString(),
            filePath: uri.fsPath,
            content: newText,
        })
    }
}
