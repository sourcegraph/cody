import type * as vscode from 'vscode'

import {
    ActiveTextEditor,
    ActiveTextEditorDiagnostic,
    ActiveTextEditorSelection,
    ActiveTextEditorViewControllers,
    ActiveTextEditorVisibleContent,
    Editor,
} from '@sourcegraph/cody-shared/src/editor'

import { Agent } from './agent'
import { DocumentOffsets } from './offsets'
import { TextDocument } from './protocol'

export class AgentEditor implements Editor {
    public controllers?: ActiveTextEditorViewControllers | undefined

    constructor(private agent: Agent) {}

    public didReceiveFixupText(): Promise<void> {
        throw new Error('Method not implemented.')
    }

    /** @deprecated Use {@link AgentEditor.getWorkspaceRootUri} instead. */
    public getWorkspaceRootPath(): string | null {
        const uri = this.getWorkspaceRootUri()
        return uri?.scheme === 'file' ? uri.fsPath : null
    }

    public getWorkspaceRootUri(): vscode.Uri | null {
        return this.agent.workspace.workspaceRootUri ?? null
    }

    private activeDocument(): TextDocument | undefined {
        if (this.agent.workspace.activeDocumentFilePath === null) {
            return undefined
        }
        return this.agent.workspace.getDocument(this.agent.workspace.activeDocumentFilePath)
    }

    public getActiveTextEditor(): ActiveTextEditor | null {
        const document = this.activeDocument()
        if (document === undefined) {
            return null
        }
        return {
            filePath: document.filePath,
            content: document.content || '',
        }
    }

    public getActiveTextEditorSelection(): ActiveTextEditorSelection | null {
        const document = this.activeDocument()
        if (document === undefined || document.content === undefined || document.selection === undefined) {
            return null
        }
        const offsets = new DocumentOffsets(document)
        if (!document.selection) {
            return {
                fileName: document.filePath ?? '',
                precedingText: document.content ?? '',
                selectedText: '',
                followingText: '',
            }
        }
        const from = offsets.offset(document.selection.start)
        const to = offsets.offset(document.selection.end)
        return {
            fileName: document.filePath || '',
            precedingText: document.content.slice(0, from),
            selectedText: document.content.slice(from, to),
            followingText: document.content.slice(to, document.content.length),
        }
    }

    public getActiveTextEditorSelectionOrEntireFile(): ActiveTextEditorSelection | null {
        const document = this.activeDocument()
        if (document !== undefined && document.selection === undefined) {
            return {
                fileName: document.filePath || '',
                precedingText: '',
                selectedText: document.content || '',
                followingText: '',
            }
        }
        return this.getActiveTextEditorSelection()
    }

    public getActiveInlineChatTextEditor(): ActiveTextEditor | null {
        throw new Error('Method not implemented.')
    }

    public getActiveInlineChatSelection(): ActiveTextEditorSelection | null {
        throw new Error('Method not implemented.')
    }

    public getActiveTextEditorSmartSelection(): Promise<ActiveTextEditorSelection | null> {
        throw new Error('Method not implemented.')
    }

    public getActiveFixupTextEditorSmartSelection(): Promise<ActiveTextEditorSelection | null> {
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
            fileName: document.filePath,
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
