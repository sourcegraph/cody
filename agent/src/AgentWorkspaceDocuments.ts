/* eslint-disable @typescript-eslint/no-explicit-any */

import type * as vscode from 'vscode'

import { AgentTextDocument } from './AgentTextDocument'
import { newTextEditor } from './AgentTextEditor'
import { TextDocument } from './protocol'
import * as vscode_shim from './vscode-shim'

export class AgentWorkspaceDocuments implements vscode_shim.WorkspaceDocuments {
    private readonly documents: Map<string, TextDocument> = new Map()
    public workspaceRootUri: vscode.Uri | undefined
    public activeDocumentFilePath: string | null = null
    public loadedDocument(document: TextDocument): TextDocument {
        const fromCache = this.documents.get(document.filePath)
        if (document.content === undefined) {
            document.content = fromCache?.content
        }
        if (document.selection === undefined) {
            document.selection = fromCache?.selection
        }
        return document
    }

    public setActiveTextEditor(textEditor: vscode.TextEditor): void {
        this.activeDocumentFilePath = textEditor.document.fileName
        vscode_shim.onDidChangeActiveTextEditor.fire(textEditor)
        vscode_shim.window.activeTextEditor = textEditor
    }

    public agentTextDocument(document: TextDocument): AgentTextDocument {
        return new AgentTextDocument(this.loadedDocument(document))
    }

    public allFilePaths(): string[] {
        return [...this.documents.keys()]
    }
    public allDocuments(): TextDocument[] {
        return [...this.documents.values()]
    }
    public getDocument(filePath: string): TextDocument | undefined {
        return this.documents.get(filePath)
    }
    public setDocument(document: TextDocument): void {
        this.documents.set(document.filePath, this.loadedDocument(document))
        const tabs: readonly vscode.Tab[] = this.allFilePaths().map(filePath => this.vscodeTab(filePath))
        vscode_shim.tabGroups.all = [
            {
                tabs,
                isActive: true,
                activeTab: this.vscodeTab(this.activeDocumentFilePath ?? ''),
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
    public deleteDocument(filePath: string): void {
        this.documents.delete(filePath)
    }
    private vscodeTab(filePath: string): vscode.Tab {
        return {
            input: {
                uri: filePath,
            },
            label: 'label',
            group: { activeTab: undefined, isActive: false, tabs: [], viewColumn: -1 },
        } as any
    }

    public openTextDocument(filePath: string): Promise<vscode.TextDocument> {
        return Promise.resolve(this.agentTextDocument({ filePath }))
    }
}
