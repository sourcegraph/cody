import fspromises from 'fs/promises'

import * as vscode from 'vscode'

import { resetActiveEditor } from '../../vscode/src/editor/active-editor'
import { TextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'

import { AgentTextDocument } from './AgentTextDocument'
import { newTextEditor } from './AgentTextEditor'
import * as vscode_shim from './vscode-shim'

/**
 * Manages document-related operations for the agent such as opening, closing,
 * and changing text contents, selections and visible ranges.
 */
export class AgentWorkspaceDocuments implements vscode_shim.WorkspaceDocuments {
    // Keys are `vscode.Uri.toString()` formatted. We don't use `vscode.Uri` as
    // keys because hashcode/equals behave unreliably.
    private readonly agentDocuments: Map<string, AgentTextDocument> = new Map()

    public workspaceRootUri: vscode.Uri | undefined
    public activeDocumentFilePath: vscode.Uri | null = null

    public openUri(uri: vscode.Uri): AgentTextDocument {
        return this.loadedDocument(new TextDocumentWithUri(uri))
    }
    public loadedDocument(document: TextDocumentWithUri): AgentTextDocument {
        const fromCache = this.agentDocuments.get(document.underlying.uri)
        if (!fromCache) {
            return new AgentTextDocument(document)
        }

        if (document.content === undefined) {
            document.underlying.content = fromCache.getText()
        }

        if (document.selection === undefined) {
            document.underlying.selection = fromCache.underlying.selection
        }

        fromCache.update(document)

        return fromCache
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
        return [...this.agentDocuments.values()]
    }

    public getDocument(uri: vscode.Uri): AgentTextDocument | undefined {
        return this.agentDocuments.get(uri.toString())
    }

    public getDocumentFromUriString(uriString: string): AgentTextDocument | undefined {
        return this.agentDocuments.get(uriString)
    }

    public addDocument(document: TextDocumentWithUri): AgentTextDocument {
        const agentDocument = this.loadedDocument(document)
        this.agentDocuments.set(document.underlying.uri, agentDocument)

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

        while (vscode_shim.visibleTextEditors.length > 0) {
            vscode_shim.visibleTextEditors.pop()
        }
        for (const document of this.allDocuments()) {
            vscode_shim.visibleTextEditors.push(newTextEditor(document))
        }
        vscode_shim.onDidChangeVisibleTextEditors.fire(vscode_shim.visibleTextEditors)

        return agentDocument
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

    public async openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
        const document = new TextDocumentWithUri(uri)
        if (!this.agentDocuments.has(document.underlying.uri)) {
            // Read the file content from disk if the user hasn't opened this file before.
            const buffer = await fspromises.readFile(uri.fsPath, 'utf8')
            document.underlying.content = buffer.toString()
        }
        return Promise.resolve(this.loadedDocument(document))
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
}
