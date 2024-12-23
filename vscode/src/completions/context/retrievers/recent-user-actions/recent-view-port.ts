import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import debounce from 'lodash/debounce'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier, type ShouldUseContextParams, shouldBeUsedAsContext } from '../../utils'
import { getNotebookLanguageId, getTextFromNotebookCells } from './notebook-utils'

interface TrackedViewPort {
    uri: vscode.Uri
    content: string
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
            const snippet = {
                uri: viewPort.uri,
                content: viewPort.content,
                identifier: this.identifier,
                metadata: {
                    timeSinceActionMs: Date.now() - viewPort.lastAccessTimestamp,
                },
            } satisfies Omit<AutocompleteContextSnippet, 'startLine' | 'endLine'>
            return snippet
        })
        const viewPortSnippets = await Promise.all(snippetPromises)
        // remove the startLine and endLine from the response which might not be valid for notebooks
        // @ts-ignore
        return viewPortSnippets
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
        if (document.uri.scheme === 'vscode-notebook-cell') {
            return vscode.window.activeNotebookEditor?.notebook.uri || document.uri
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
            this.updateTrackedViewPort(
                this.activeTextEditor.document.uri,
                this.activeTextEditor.document.getText(this.activeTextEditor.visibleRanges[0]),
                this.activeTextEditor.document.languageId
            )
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
        this.updateTrackedViewPort(
            editor.document.uri,
            editor.document.getText(visibleRanges?.at(-1)),
            editor.document.languageId
        )
    }

    private updateNotebookEditor(
        notebookEditor: vscode.NotebookEditor,
        visibleRanges: readonly vscode.NotebookRange[]
    ): void {
        if (!notebookEditor.notebook || visibleRanges.length === 0) {
            return
        }
        const visibleCells = notebookEditor.notebook.getCells(visibleRanges?.at(-1))
        const content = getTextFromNotebookCells(notebookEditor.notebook, visibleCells)

        this.updateTrackedViewPort(
            notebookEditor.notebook.uri,
            content,
            getNotebookLanguageId(notebookEditor.notebook)
        )
    }

    private updateTrackedViewPort(uri: vscode.Uri, content: string, languageId: string): void {
        if (uri.scheme !== 'file') {
            return
        }
        const now = Date.now()
        const key = uri.toString()

        this.viewportsByDocumentUri.set(key, {
            uri,
            content,
            languageId,
            lastAccessTimestamp: now,
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
