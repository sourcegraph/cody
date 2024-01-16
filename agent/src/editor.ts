import type * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'
import {
    type ActiveTextEditor,
    type ActiveTextEditorDiagnostic,
    type ActiveTextEditorSelection,
    type ActiveTextEditorViewControllers,
    type ActiveTextEditorVisibleContent,
    type Editor,
} from '@sourcegraph/cody-shared/src/editor'

import { type TextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'

import { type Agent } from './agent'
import { DocumentOffsets } from './offsets'

export class AgentEditor implements Editor {
    public controllers?: ActiveTextEditorViewControllers | undefined

    constructor(private agent: Agent) {}

    /** @deprecated Use {@link AgentEditor.getWorkspaceRootUri} instead. */
    public getWorkspaceRootPath(): string | null {
        const uri = this.getWorkspaceRootUri()
        return uri?.scheme === 'file' ? uri.fsPath : null
    }

    public getWorkspaceRootUri(): vscode.Uri | null {
        return this.agent.workspace.workspaceRootUri ?? null
    }

    private activeDocument(): TextDocumentWithUri | undefined {
        if (this.agent.workspace.activeDocumentFilePath === null) {
            return undefined
        }
        if (isCodyIgnoredFile(URI.file(this.agent.workspace.activeDocumentFilePath.fsPath))) {
            return undefined
        }
        return this.agent.workspace.getDocument(this.agent.workspace.activeDocumentFilePath)?.underlying
    }

    public getActiveTextEditor(): ActiveTextEditor | null {
        const document = this.activeDocument()
        if (document === undefined) {
            return null
        }
        return {
            fileUri: document.uri,
            selectionRange: document.selection,
            content: document.content || '',
        }
    }

    public async getTextEditorContentForFile(uri: URI): Promise<string | undefined> {
        if (!uri) {
            return Promise.resolve(undefined)
        }

        const doc = this.agent.workspace.getDocumentFromUriString(uri.toString())
        return Promise.resolve(doc?.getText())
    }

    public getActiveTextEditorSelection(): ActiveTextEditorSelection | null {
        const document = this.activeDocument()
        if (document?.content === undefined || document.selection === undefined) {
            return null
        }
        const offsets = new DocumentOffsets(document.underlying)
        if (!document.selection) {
            return {
                fileUri: document.uri,
                selectionRange: document.selection,
                precedingText: document.content ?? '',
                selectedText: '',
                followingText: '',
            }
        }
        const from = offsets.offset(document.selection.start)
        const to = offsets.offset(document.selection.end)
        return {
            fileUri: document.uri,
            selectionRange: document.selection,
            precedingText: document.content.slice(0, from),
            selectedText: document.content.slice(from, to),
            followingText: document.content.slice(to, document.content.length),
        }
    }

    public getActiveTextEditorSelectionOrEntireFile(): ActiveTextEditorSelection | null {
        const document = this.activeDocument()
        if (document !== undefined && document.selection === undefined) {
            return {
                fileUri: document.uri,
                precedingText: '',
                selectedText: document.content || '',
                followingText: '',
            }
        }
        return this.getActiveTextEditorSelection()
    }

    public getActiveTextEditorSmartSelection(): Promise<ActiveTextEditorSelection | null> {
        throw new Error('Method not implemented.')
    }

    public getActiveTextEditorSelectionOrVisibleContent(): ActiveTextEditorSelection | null {
        throw new Error('Method not implemented.')
    }

    public getActiveTextEditorDiagnosticsForRange(): ActiveTextEditorDiagnostic[] | null {
        throw new Error('Method not implemented.')
    }

    public getActiveTextEditorVisibleContent(): ActiveTextEditorVisibleContent | null {
        const document = this.activeDocument()
        if (document === undefined) {
            return null
        }
        return {
            content: document.content || '',
            fileUri: document.uri,
        }
    }

    public replaceSelection(): Promise<void> {
        throw new Error('Not implemented')
    }

    public showQuickPick(): Promise<string | undefined> {
        throw new Error('Not implemented')
    }

    public showWarningMessage(): Promise<void> {
        throw new Error('Not implemented')
    }

    public showInputBox(): Promise<string | undefined> {
        throw new Error('Not implemented')
    }
}
