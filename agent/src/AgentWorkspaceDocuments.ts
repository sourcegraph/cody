import fspromises from 'node:fs/promises'

import * as vscode from 'vscode'

import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'

import { logError } from '@sourcegraph/cody-shared'
import { doesFileExist } from '../../vscode/src/commands/utils/workspace-files'
import { resetActiveEditor } from '../../vscode/src/editor/active-editor'
import { AgentTextDocument } from './AgentTextDocument'
import { AgentTextEditor } from './AgentTextEditor'
import { applyContentChanges } from './applyContentChanges'
import { calculateContentChanges } from './calculateContentChanges'
import { clearArray } from './clearArray'
import { panicWhenClientIsOutOfSync } from './panicWhenClientIsOutOfSync'
import * as vscode_shim from './vscode-shim'

export type EditFunction = (
    uri: vscode.Uri,
    callback: (editBuilder: vscode.TextEditorEdit) => void,
    options?: { readonly undoStopBefore: boolean; readonly undoStopAfter: boolean }
) => Promise<boolean>

/**
 * Manages document-related operations for the agent such as opening, closing,
 * and changing text contents, selections and visible ranges.
 */
export class AgentWorkspaceDocuments implements vscode_shim.WorkspaceDocuments {
    constructor(
        private params?: {
            edit?: EditFunction
            doPanic?: (message: string) => void
        }
    ) {}

    // Keys are `vscode.Uri.toString()` formatted. We don't use `vscode.Uri` as
    // keys because hashcode/equals behave unreliably.
    private readonly agentDocuments: Map<
        string,
        { document: AgentTextDocument; editor: AgentTextEditor }
    > = new Map()

    public workspaceRootUri: vscode.Uri | undefined
    public activeDocumentFilePath: vscode.Uri | null = null

    private doPanic = this.params?.doPanic ? { doPanic: this.params.doPanic } : undefined

    public openUri(uri: vscode.Uri): AgentTextDocument {
        return this.loadAndUpdateDocument(ProtocolTextDocumentWithUri.from(uri))
    }
    public loadAndUpdateDocument(document: ProtocolTextDocumentWithUri): AgentTextDocument {
        return this.loadDocumentWithChanges(document).document
    }
    public loadDocumentWithChanges(document: ProtocolTextDocumentWithUri): {
        document: AgentTextDocument
        editor: AgentTextEditor
        contentChanges: vscode.TextDocumentContentChangeEvent[]
    } {
        const cached = this.agentDocuments.get(document.underlying.uri)
        if (!cached) {
            const result = new AgentTextDocument(document)
            const editor = new AgentTextEditor(result, this.params)
            this.agentDocuments.set(document.underlying.uri, { document: result, editor })
            return { document: result, editor, contentChanges: [] }
        }
        const { document: fromCache } = cached

        // The client may send null values that we convert to undefined here.
        if (document.content === null) {
            document.underlying.content = undefined
        }
        if (document.contentChanges === null) {
            document.underlying.contentChanges = undefined
        }
        if (document.selection === null) {
            document.underlying.selection = undefined
        }
        if (document.visibleRange === null) {
            document.underlying.visibleRange = undefined
        }

        // We have seen this document before, which means we mutate the existing
        // document to reflect the latest chagnes. For each URI, we keep a
        // singleton document so that `AgentTextDocument.getText()` always
        // reflects the latest value.
        const contentChanges: vscode.TextDocumentContentChangeEvent[] = []
        if (document.contentChanges && document.contentChanges.length > 0) {
            // Incremental document sync.
            const changes = applyContentChanges(fromCache, document.contentChanges)
            contentChanges.push(...changes.contentChanges)
            document.underlying.content = changes.newText
        } else if (document.content !== undefined) {
            // Full document sync.
            for (const change of calculateContentChanges(fromCache, document.content)) {
                contentChanges.push(change)
            }
        } else {
            // No document sync. Use content from last update.
            document.underlying.content = fromCache.getText()
        }

        if (!document.selection) {
            // No changes to the selection, populate from cache
            document.underlying.selection = fromCache.protocolDocument.selection
        }

        if (!document.visibleRange) {
            // No changes to the visible range, populate from cache
            document.underlying.visibleRange = fromCache.protocolDocument.visibleRange
        }

        fromCache.update(document)

        panicWhenClientIsOutOfSync(document.underlying, cached.editor, this.doPanic)

        return { document: fromCache, editor: cached.editor, contentChanges }
    }

    public setActiveTextEditor(textEditor: vscode.TextEditor): void {
        this.activeDocumentFilePath = textEditor.document.uri
        vscode_shim.onDidChangeActiveTextEditor.fire(textEditor)
        vscode_shim.window.activeTextEditor = textEditor
    }

    public allUris(): string[] {
        return [...this.agentDocuments.keys()]
    }

    public allDocuments(): AgentTextDocument[] {
        return [...this.agentDocuments.values()].map(value => value.document)
    }

    public getDocument(uri: vscode.Uri): AgentTextDocument | undefined {
        return this.agentDocuments.get(uri.toString())?.document
    }

    public getDocumentFromUriString(uriString: string): AgentTextDocument | undefined {
        return this.agentDocuments.get(uriString)?.document
    }

    public loadDocument(document: ProtocolTextDocumentWithUri): AgentTextDocument {
        return this.loadDocumentWithChanges(document).document
    }

    public fireVisibleTextEditorsDidChange(): Promise<void> {
        const tabs: vscode.Tab[] = []
        for (const uri of this.allUris()) {
            const document = this.getDocumentFromUriString(uri)
            if (!document) {
                continue
            }
            tabs.push(this.vscodeTab(document.uri))
        }

        vscode_shim.tabGroups.all = [
            {
                tabs,
                isActive: true,
                activeTab: this.activeDocumentFilePath
                    ? this.vscodeTab(this.activeDocumentFilePath)
                    : undefined,
                viewColumn: vscode_shim.ViewColumn.Active,
            },
        ]

        clearArray(vscode_shim.visibleTextEditors)
        clearArray(vscode_shim.workspaceTextDocuments)

        for (const document of this.allDocuments()) {
            vscode_shim.workspaceTextDocuments.push(document)
            vscode_shim.visibleTextEditors.push(this.newTextEditor(document))
        }

        const pendingPromise = vscode_shim.onDidChangeVisibleTextEditors.cody_fireAsync(
            vscode_shim.visibleTextEditors
        )
        return pendingPromise
    }

    public deleteDocument(uri: vscode.Uri): void {
        this.agentDocuments.delete(uri.toString())
    }

    private vscodeTab(uri: vscode.Uri): vscode.Tab {
        return {
            input: {
                uri,
            },
            label: 'label',
            group: { activeTab: undefined, isActive: false, tabs: [], viewColumn: -1 },
        } as any
    }

    public async openTextDocument(uri: vscode.Uri): Promise<AgentTextDocument> {
        const document = ProtocolTextDocumentWithUri.from(uri)
        if (!this.agentDocuments.has(document.underlying.uri)) {
            if (uri.scheme === 'untitled') {
                document.underlying.content = ''
            } else if (!(await doesFileExist(uri))) {
                logError(
                    'AgentWorkspaceDocuments.openTextDocument()',
                    'File does not exist',
                    uri.toString()
                )
            } else if (uri.scheme === 'file') {
                // Read the file content from disk if the user hasn't opened this file before.
                const buffer = await fspromises.readFile(uri.fsPath, 'utf8')
                document.underlying.content = buffer.toString()
            } else {
                logError('vscode.workspace.openTextDocument', `unable to read non-file URI: ${uri}`)
            }
        }
        return Promise.resolve(this.loadAndUpdateDocument(document))
    }

    public async reset(): Promise<void> {
        for (const uri of this.agentDocuments.keys()) {
            const document = this.openUri(vscode.Uri.parse(uri))
            await vscode_shim.onDidCloseTextDocument.cody_fireAsync(document)
        }
        vscode_shim.window.activeTextEditor = undefined
        while (vscode_shim.visibleTextEditors.length > 0) {
            vscode_shim.visibleTextEditors.pop()
        }
        vscode_shim.tabGroups.reset()
        resetActiveEditor()
    }

    public async newTextEditorFromStringUri(uri: string): Promise<vscode.TextEditor> {
        return this.newTextEditor(await this.openTextDocument(vscode.Uri.parse(uri)))
    }

    public newTextEditor(document: AgentTextDocument): vscode.TextEditor {
        return (
            this.agentDocuments.get(document.protocolDocument.underlying.uri)?.editor ??
            new AgentTextEditor(document, this.params)
        )
    }
}
