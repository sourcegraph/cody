import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import debounce from 'lodash/debounce'
import * as vscode from 'vscode'
import { LRUCache } from 'lru-cache'
import type { ContextRetriever } from '../../../types'
import { RetrieverIdentifier } from '../../utils'

const MAX_RETRIEVED_VIEWPORTS = 5

interface TrackedViewPort {
    uri: vscode.Uri
    visibleRange: vscode.Range
    lastAccessTimestamp: number
}

export class RecentViewPortRetriever implements vscode.Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.RecentViewPortRetriever
    private disposables: vscode.Disposable[] = []
    private viewportsByDocumentUri: LRUCache<string, TrackedViewPort>

    constructor(
        private readonly maxTrackedFiles: number = 10,
        private window: Pick<typeof vscode.window, 'onDidChangeTextEditorVisibleRanges'> = vscode.window
    ) {
        this.viewportsByDocumentUri = new LRUCache<string, TrackedViewPort>({ max: this.maxTrackedFiles })
        this.disposables.push(
            this.window.onDidChangeTextEditorVisibleRanges(
                debounce(this.onDidChangeTextEditorVisibleRanges.bind(this), 300)
            )
        )
    }

    public async retrieve(): Promise<AutocompleteContextSnippet[]> {
        const sortedViewPorts = Array.from(this.viewportsByDocumentUri.entries())
            .map(([_, value]) => value)
            .filter((value): value is TrackedViewPort => value !== undefined)
            .sort((a, b) => b.lastAccessTimestamp - a.lastAccessTimestamp)
            .slice(0, MAX_RETRIEVED_VIEWPORTS)

        const snippetPromises = sortedViewPorts.map(async viewPort => {
            const document = await vscode.workspace.openTextDocument(viewPort.uri)
            const content = document.getText(viewPort.visibleRange)

            return {
                uri: viewPort.uri,
                content,
                startLine: viewPort.visibleRange.start.line,
                endLine: viewPort.visibleRange.end.line,
                identifier: this.identifier,
            }
        })
        return Promise.all(snippetPromises)
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    private onDidChangeTextEditorVisibleRanges(event: vscode.TextEditorVisibleRangesChangeEvent): void {
        const { textEditor, visibleRanges } = event
        if (visibleRanges.length === 0) {
            return
        }
        const uri = textEditor.document.uri
        const visibleRange = visibleRanges[0]
        this.updateTrackedViewPort(uri, visibleRange)
    }

    private updateTrackedViewPort(uri: vscode.Uri, visibleRange: vscode.Range): void {
        const now = Date.now()
        const key = uri.toString()

        this.viewportsByDocumentUri.set(key, {
            uri,
            visibleRange,
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
