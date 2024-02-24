import fspromises from 'fs/promises'

import * as vscode from 'vscode'

import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'

import { logDebug, logError } from '@sourcegraph/cody-shared'
import { doesFileExist } from '../../vscode/src/commands/utils/workspace-files'
import { resetActiveEditor } from '../../vscode/src/editor/active-editor'
import { AgentTextDocument } from './AgentTextDocument'
import * as vscode_shim from './vscode-shim'

type EditFunction = (
    uri: vscode.Uri,
    callback: (editBuilder: vscode.TextEditorEdit) => void,
    options?: { readonly undoStopBefore: boolean; readonly undoStopAfter: boolean }
) => Promise<boolean>

/**
 * Manages document-related operations for the agent such as opening, closing,
 * and changing text contents, selections and visible ranges.
 */
export class AgentWorkspaceDocuments implements vscode_shim.WorkspaceDocuments {
    constructor(private params?: { edit?: EditFunction }) {}
    // Keys are `vscode.Uri.toString()` formatted. We don't use `vscode.Uri` as
    // keys because hashcode/equals behave unreliably.
    private readonly agentDocuments: Map<string, AgentTextDocument> = new Map()

    public workspaceRootUri: vscode.Uri | undefined
    public activeDocumentFilePath: vscode.Uri | null = null

    public openUri(uri: vscode.Uri): AgentTextDocument {
        return this.loadedDocument(ProtocolTextDocumentWithUri.from(uri))
    }
    public loadedDocument(document: ProtocolTextDocumentWithUri): AgentTextDocument {
        const fromCache = this.agentDocuments.get(document.underlying.uri)
        if (!fromCache) {
            return new AgentTextDocument(document)
        }

        if (document.content === undefined) {
            document.underlying.content = fromCache.getText()
        }

        if (document.selection === undefined) {
            document.underlying.selection = fromCache.protocolDocument.selection
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

    public addDocument(document: ProtocolTextDocumentWithUri): AgentTextDocument {
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
            vscode_shim.visibleTextEditors.push(this.newTextEditor(document))
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

    public async openTextDocument(uri: vscode.Uri): Promise<AgentTextDocument> {
        const document = ProtocolTextDocumentWithUri.from(uri)
        if (!this.agentDocuments.has(document.underlying.uri)) {
            if (!doesFileExist(uri)) {
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

    public async newTextEditorFromStringUri(uri: string): Promise<vscode.TextEditor> {
        return this.newTextEditor(await this.openTextDocument(vscode.Uri.parse(uri)))
    }

    public newTextEditor(document: AgentTextDocument): vscode.TextEditor {
        const selection: vscode.Selection = document.protocolDocument.selection
            ? new vscode.Selection(
                  new vscode.Position(
                      document.protocolDocument.selection.start.line,
                      document.protocolDocument.selection.start.character
                  ),
                  new vscode.Position(
                      document.protocolDocument.selection.end.line,
                      document.protocolDocument.selection.end.character
                  )
              )
            : new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))

        return {
            // Looking at the implementation of the extension, we only need
            // to provide `document` but we do a best effort to shim the
            // rest of the `TextEditor` properties.
            document,
            selection,
            selections: [selection],
            edit: (callback, options) => {
                if (this.params?.edit) {
                    return this.params.edit(document.uri, callback, options)
                }
                logDebug('AgentTextEditor:edit()', 'not supported')
                return Promise.resolve(false)
            },
            insertSnippet: () => Promise.resolve(true),
            revealRange: () => {}, // TODO: implement this for inline edit commands?
            options: {
                cursorStyle: undefined,
                insertSpaces: undefined,
                lineNumbers: undefined,
                // TODO: fix tabSize
                tabSize: 2,
            },
            setDecorations: () => {},
            viewColumn: vscode.ViewColumn.Active,
            visibleRanges: [selection],
            show: () => {},
            hide: () => {},
        }
    }
}
