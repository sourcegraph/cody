import type { URI } from 'vscode-uri'
import type { RangeData } from '../common/range'

export interface ActiveTextEditor {
    content: string
    fileUri: URI
    repoName?: string
    revision?: string
    selectionRange?: RangeData

    ignored?: boolean
}

export interface ActiveTextEditorSelection {
    fileUri: URI
    repoName?: string
    revision?: string
    precedingText: string
    selectedText: string
    followingText: string
    selectionRange?: RangeData | null
}

export type ActiveTextEditorDiagnosticType = 'error' | 'warning' | 'information' | 'hint'

export interface ActiveTextEditorDiagnostic {
    type: ActiveTextEditorDiagnosticType
    range: RangeData
    text: string
    message: string
}

export interface ActiveTextEditorVisibleContent {
    content: string
    fileUri: URI
    repoName?: string
    revision?: string
}

export interface Editor {
    /** The URI of the workspace root. */
    getWorkspaceRootUri(): URI | null

    getActiveTextEditor(): ActiveTextEditor | null
    getActiveTextEditorSelection(): ActiveTextEditorSelection | null

    /**
     * Get diagnostics (errors, warnings, hints) for a range within the active text editor.
     */
    getActiveTextEditorDiagnosticsForRange(range: RangeData): ActiveTextEditorDiagnostic[] | null

    getActiveTextEditorVisibleContent(): ActiveTextEditorVisibleContent | null

    getTextEditorContentForFile(uri: URI, range?: RangeData): Promise<string | undefined>

    showWarningMessage(message: string): Promise<void>
}

export class NoopEditor implements Editor {
    public getWorkspaceRootUri(): URI | null {
        return null
    }

    public getActiveTextEditor(): ActiveTextEditor | null {
        return null
    }

    public getActiveTextEditorSelection(): ActiveTextEditorSelection | null {
        return null
    }

    public getActiveTextEditorDiagnosticsForRange(): ActiveTextEditorDiagnostic[] | null {
        return null
    }

    public getActiveTextEditorVisibleContent(): ActiveTextEditorVisibleContent | null {
        return null
    }

    public getTextEditorContentForFile(_uri: URI, _range?: RangeData): Promise<string | undefined> {
        return Promise.resolve(undefined)
    }

    public showWarningMessage(_message: string): Promise<void> {
        return Promise.resolve()
    }
}
