import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import debounce from 'lodash/debounce'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier, type ShouldUseContextParams, shouldBeUsedAsContext } from '../../utils'

interface TrackedViewPort {
    uri: vscode.Uri
    visibleRange: vscode.Range
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
            'onDidChangeTextEditorVisibleRanges' | 'onDidChangeActiveTextEditor' | 'activeTextEditor'
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
            window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor.bind(this))
        )
    }

    public async retrieve({ document }: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const sortedViewPorts = this.getValidViewPorts(document)

        const snippetPromises = sortedViewPorts.map(async viewPort => {
            const document = await vscode.workspace.openTextDocument(viewPort.uri)
            const content = document.getText(viewPort.visibleRange)

            return {
                uri: viewPort.uri,
                content,
                startLine: viewPort.visibleRange.start.line,
                endLine: viewPort.visibleRange.end.line,
                identifier: this.identifier,
                timeSinceActionMs: Date.now() - viewPort.lastAccessTimestamp,
            }
        })
        return Promise.all(snippetPromises)
    }

    private getValidViewPorts(document: vscode.TextDocument): TrackedViewPort[] {
        const currentFileUri = document.uri.toString()
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

    public isSupportedForLanguageId(): boolean {
        return true
    }

    private onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
        if (this.activeTextEditor) {
            // Update the previous editor which was active before this one
            // Most of the property would remain same, but lastAccessTimestamp would be updated on the update
            this.updateTrackedViewPort(
                this.activeTextEditor.document,
                this.activeTextEditor.visibleRanges[0],
                this.activeTextEditor.document.languageId
            )
        }
        this.activeTextEditor = editor
        if (!editor?.visibleRanges?.[0]) {
            return
        }
        this.updateTrackedViewPort(editor.document, editor.visibleRanges[0], editor.document.languageId)
    }

    private onDidChangeTextEditorVisibleRanges(event: vscode.TextEditorVisibleRangesChangeEvent): void {
        const { textEditor, visibleRanges } = event
        if (visibleRanges.length === 0) {
            return
        }
        this.updateTrackedViewPort(textEditor.document, visibleRanges[0], textEditor.document.languageId)
    }

    private updateTrackedViewPort(
        document: vscode.TextDocument,
        visibleRange: vscode.Range,
        languageId: string
    ): void {
        if (document.uri.scheme !== 'file') {
            return
        }
        const now = Date.now()
        const key = document.uri.toString()

        this.viewportsByDocumentUri.set(key, {
            uri: document.uri,
            visibleRange,
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
