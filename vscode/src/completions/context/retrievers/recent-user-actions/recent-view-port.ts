import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import debounce from 'lodash/debounce'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier, type ShouldUseContextParams, shouldBeUsedAsContext } from '../../utils'
import {
    getActiveNotebookUri,
    getCellIndexInActiveNotebookEditor,
    getNotebookLanguageId,
    getTextFromNotebookCells,
} from './notebook-utils'

interface TrackedViewPort {
    uri: vscode.Uri
    content: string
    startLine?: number
    endLine?: number
    languageId: string
    lastAccessTimestamp: number
}

interface RecentViewPortRetrieverOptions {
    maxTrackedViewPorts: number
    maxRetrievedViewPorts: number
}

export class RecentViewPortRetriever implements vscode.Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.RecentViewPortRetriever
    private disposables: vscode.Disposable[] = []
    private viewportsByDocumentUri: LRUCache<string, TrackedViewPort>
    private readonly maxTrackedViewPorts: number
    private readonly maxRetrievedViewPorts: number
    private activeTextEditor: vscode.TextEditor | undefined

    constructor(
        options: RecentViewPortRetrieverOptions,
        readonly window: Pick<
            typeof vscode.window,
            | 'onDidChangeTextEditorVisibleRanges'
            | 'onDidChangeActiveTextEditor'
            | 'activeTextEditor'
            | 'onDidChangeNotebookEditorVisibleRanges'
            | 'onDidChangeActiveNotebookEditor'
        > = vscode.window
    ) {
        this.maxTrackedViewPorts = options.maxTrackedViewPorts
        this.maxRetrievedViewPorts = options.maxRetrievedViewPorts
        this.viewportsByDocumentUri = new LRUCache<string, TrackedViewPort>({
            max: this.maxTrackedViewPorts,
        })
        this.activeTextEditor = window.activeTextEditor
        this.disposables.push(
            window.onDidChangeTextEditorVisibleRanges(
                debounce(this.onDidChangeTextEditorVisibleRanges.bind(this), 300)
            ),
            window.onDidChangeNotebookEditorVisibleRanges(
                debounce(this.onDidChangeNotebookEditorVisibleRanges.bind(this), 300)
            ),
            window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor.bind(this)),
            window.onDidChangeActiveNotebookEditor(this.onDidChangeActiveNotebookEditor.bind(this))
        )
    }

    public async retrieve({ document }: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const sortedViewPorts = this.getValidViewPorts(document)

        const snippetPromises = sortedViewPorts.map(async viewPort => {
            const snippet: AutocompleteContextSnippet = {
                uri: viewPort.uri,
                content: viewPort.content,
                identifier: this.identifier,
                startLine: viewPort.startLine,
                endLine: viewPort.endLine,
                metadata: {
                    timeSinceActionMs: Date.now() - viewPort.lastAccessTimestamp,
                },
            }
            return snippet
        })
        return Promise.all(snippetPromises)
    }

    private getValidViewPorts(document: vscode.TextDocument): TrackedViewPort[] {
        const currentFileUri = this.getCurrentDocumentUri(document).toString()
        const currentLanguageId = document.languageId
        const viewPorts = Array.from(this.viewportsByDocumentUri.entries())
            .map(([_, value]) => value)
            .filter((value): value is TrackedViewPort => value !== undefined)

        const sortedViewPorts = viewPorts
            .filter(viewport => viewport.uri.toString() !== currentFileUri)
            .filter(viewport => {
                const params: ShouldUseContextParams = {
                    baseLanguageId: currentLanguageId,
                    languageId: viewport.languageId,
                }
                return shouldBeUsedAsContext(params)
            })
            .sort((a, b) => b.lastAccessTimestamp - a.lastAccessTimestamp)
            .slice(0, this.maxRetrievedViewPorts)

        return sortedViewPorts
    }

    private getCurrentDocumentUri(document: vscode.TextDocument): vscode.Uri {
        if (getCellIndexInActiveNotebookEditor(document) !== -1) {
            return getActiveNotebookUri() ?? document.uri
        }
        return document.uri
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    private onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
        if (this.activeTextEditor) {
            // Update the previous editor which was active before this one
            // Most of the property would remain same, but lastAccessTimestamp would be updated on the update
            this.updateTrackedViewPort({
                uri: this.activeTextEditor.document.uri,
                content: this.activeTextEditor.document.getText(this.activeTextEditor.visibleRanges[0]),
                languageId: this.activeTextEditor.document.languageId,
                startLine: this.activeTextEditor.visibleRanges.at(-1)?.start.line,
                endLine: this.activeTextEditor.visibleRanges.at(-1)?.end.line,
            })
        }
        if (!editor) {
            return
        }
        this.updateTextEditor(editor, editor.visibleRanges)
    }

    private onDidChangeActiveNotebookEditor(editor: vscode.NotebookEditor | undefined): void {
        if (!editor?.notebook) {
            return
        }
        this.updateNotebookEditor(editor, editor.visibleRanges)
    }

    private onDidChangeTextEditorVisibleRanges(event: vscode.TextEditorVisibleRangesChangeEvent): void {
        this.updateTextEditor(event.textEditor, event.visibleRanges)
    }

    private onDidChangeNotebookEditorVisibleRanges(
        event: vscode.NotebookEditorVisibleRangesChangeEvent
    ) {
        this.updateNotebookEditor(event.notebookEditor, event.visibleRanges)
    }

    private updateTextEditor(editor: vscode.TextEditor, visibleRanges: readonly vscode.Range[]): void {
        if (visibleRanges.length === 0) {
            return
        }
        this.updateTrackedViewPort({
            uri: editor.document.uri,
            content: editor.document.getText(visibleRanges?.at(-1)),
            languageId: editor.document.languageId,
            startLine: visibleRanges?.at(-1)?.start.line,
            endLine: visibleRanges?.at(-1)?.end.line,
        })
    }

    private updateNotebookEditor(
        notebookEditor: vscode.NotebookEditor,
        visibleRanges: readonly vscode.NotebookRange[]
    ): void {
        if (!notebookEditor.notebook || visibleRanges.length === 0) {
            return
        }
        const visibleCells = notebookEditor.notebook.getCells(visibleRanges?.at(-1))
        const content = getTextFromNotebookCells(notebookEditor.notebook, visibleCells).toString()

        this.updateTrackedViewPort({
            uri: notebookEditor.notebook.uri,
            content,
            languageId: getNotebookLanguageId(notebookEditor.notebook),
        })
    }

    private updateTrackedViewPort(params: {
        uri: vscode.Uri
        content: string
        languageId: string
        startLine?: number
        endLine?: number
    }): void {
        if (params.uri.scheme !== 'file') {
            return
        }
        const now = Date.now()
        const key = params.uri.toString()

        this.viewportsByDocumentUri.set(key, {
            uri: params.uri,
            content: params.content,
            languageId: params.languageId,
            lastAccessTimestamp: now,
            startLine: params.startLine,
            endLine: params.endLine,
        })
    }

    public dispose(): void {
        this.viewportsByDocumentUri.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
