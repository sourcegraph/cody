/* eslint-disable @typescript-eslint/no-explicit-any */

import type * as vscode from 'vscode'

import { TextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'

import { AgentTextDocument } from './AgentTextDocument'
import { newTextEditor } from './AgentTextEditor'
import * as vscode_shim from './vscode-shim'

export class AgentWorkspaceDocuments implements vscode_shim.WorkspaceDocuments {
    // Keys are `vscode.Uri.toString()` formatted. We don't use `vscode.Uri` as
    // keys because hascode/equals behave unreliably.
    private readonly documents: Map<string, TextDocumentWithUri> = new Map()
    public workspaceRootUri: vscode.Uri | undefined
    public activeDocumentFilePath: vscode.Uri | null = null
    public loadedDocument(document: TextDocumentWithUri): TextDocumentWithUri {
        const fromCache = this.documents.get(document.underlying.uri)
        if (document.content === undefined) {
            document.underlying.content = fromCache?.content
        }
        if (document.selection === undefined) {
            document.underlying.selection = fromCache?.selection
        }
        return document
    }

    public setActiveTextEditor(textEditor: vscode.TextEditor): void {
        this.activeDocumentFilePath = textEditor.document.uri
        vscode_shim.onDidChangeActiveTextEditor.fire(textEditor)
        vscode_shim.window.activeTextEditor = textEditor
    }

    public agentTextDocument(document: TextDocumentWithUri): AgentTextDocument {
        return new AgentTextDocument(this.loadedDocument(document))
    }

    public allUris(): string[] {
        return [...this.documents.keys()]
    }
    public allDocuments(): TextDocumentWithUri[] {
        return [...this.documents.values()]
    }
    public getDocument(uri: vscode.Uri): TextDocumentWithUri | undefined {
        return this.documents.get(uri.toString())
    }
    public getDocumentFromUriString(uriString: string): TextDocumentWithUri | undefined {
        return this.documents.get(uriString)
    }
    public addDocument(document: TextDocumentWithUri): void {
        this.documents.set(document.underlying.uri, this.loadedDocument(document))

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
                activeTab: this.activeDocumentFilePath ? this.vscodeTab(this.activeDocumentFilePath) : undefined,
                viewColumn: vscode_shim.ViewColumn.Active,
            },
        ]

        while (vscode_shim.visibleTextEditors.length > 0) {
            vscode_shim.visibleTextEditors.pop()
        }
        for (const document of this.allDocuments()) {
            vscode_shim.visibleTextEditors.push(newTextEditor(this.agentTextDocument(document)))
        }
    }
    public deleteDocument(uri: vscode.Uri): void {
        this.documents.delete(uri.toString())
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

    public openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
        return Promise.resolve(this.agentTextDocument(new TextDocumentWithUri(uri)))
    }
}
