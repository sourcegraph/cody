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
    window?: Pick<typeof vscode.window, 'onDidChangeTextEditorVisibleRanges'>
}

export class RecentViewPortRetriever implements vscode.Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.RecentViewPortRetriever
    private disposables: vscode.Disposable[] = []
    private viewportsByDocumentUri: LRUCache<string, TrackedViewPort>
    private readonly maxTrackedViewPorts: number
    private readonly maxRetrievedViewPorts: number
    private window: Pick<typeof vscode.window, 'onDidChangeTextEditorVisibleRanges'>

    constructor({
        maxTrackedViewPorts,
        maxRetrievedViewPorts,
        window = vscode.window,
    }: RecentViewPortRetrieverOptions) {
        this.maxTrackedViewPorts = maxTrackedViewPorts
        this.maxRetrievedViewPorts = maxRetrievedViewPorts
        this.window = window
        this.viewportsByDocumentUri = new LRUCache<string, TrackedViewPort>({
            max: this.maxTrackedViewPorts,
        })
        this.disposables.push(
            this.window.onDidChangeTextEditorVisibleRanges(
                debounce(this.onDidChangeTextEditorVisibleRanges.bind(this), 300)
            )
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
                    enableExtendedLanguagePool: false,
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

    private onDidChangeTextEditorVisibleRanges(event: vscode.TextEditorVisibleRangesChangeEvent): void {
        const { textEditor, visibleRanges } = event
        if (visibleRanges.length === 0) {
            return
        }
        const uri = textEditor.document.uri
        const visibleRange = visibleRanges[0]
        const languageId = textEditor.document.languageId
        this.updateTrackedViewPort(uri, visibleRange, languageId)
    }

    private updateTrackedViewPort(
        uri: vscode.Uri,
        visibleRange: vscode.Range,
        languageId: string
    ): void {
        const now = Date.now()
        const key = uri.toString()

        this.viewportsByDocumentUri.set(key, {
            uri,
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
