import path from 'node:path'

import { debounce } from 'lodash'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { HoverContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { dedupeWith } from '@sourcegraph/cody-shared/src/common'

import { getGraphContextFromRange } from '../../graph/lsp/graph'
import { ContextSnippet, SymbolContextSnippet } from '../types'

import { GraphContextFetcher, supportedLanguageId } from './context-graph'
import { SectionObserver } from './section-observer'
import { CustomAbortController, CustomAbortSignal } from './utils'

export class LspLightGraphCache implements vscode.Disposable, GraphContextFetcher {
    private disposables: vscode.Disposable[] = []
    private cache: GraphCache = new GraphCache()
    private sectionObserver: SectionObserver = SectionObserver.createInstance()

    private lastRequestKey: string | null = null
    private abortLastRequest: () => void = () => {}

    public static instance: LspLightGraphCache | null = null
    public static createInstance(): LspLightGraphCache {
        if (this.instance) {
            throw new Error('LspLightGraphCache has already been initialized')
        }
        this.instance = new LspLightGraphCache()
        return this.instance
    }

    private constructor() {
        this.onDidChangeTextEditorSelection = debounce(this.onDidChangeTextEditorSelection.bind(this), 100)
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this))
        )
    }

    public async getContextAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        maxChars: number,
        contextRange?: vscode.Range
    ): Promise<ContextSnippet[]> {
        const key = `${document.uri.toString()}█${position.line}█${document.lineAt(position.line).text}`
        if (this.lastRequestKey !== key) {
            this.abortLastRequest()
        }

        const abortController = new CustomAbortController()

        this.lastRequestKey = key
        this.abortLastRequest = () => abortController.abort()

        const prevLine = Math.max(position.line - 1, 0)
        const currentLine = position.line

        const [prevLineContext, currentLineContext, sectionHistory] = await Promise.all([
            this.getLspContextForLine(document, prevLine, 0, abortController.signal),
            this.getLspContextForLine(document, currentLine, 1, abortController.signal),
            this.sectionObserver.getSectionHistory(document, position, contextRange),
        ])

        const sectionGraphContext = [...prevLineContext, ...currentLineContext]

        if (maxChars === 0) {
            // This is likely just a preloading request, so we don't need to prepare the actual
            // context
            return []
        }

        let usedContextChars = 0
        const context: ContextSnippet[] = []

        function overlapsContextRange(uri: vscode.Uri, range?: { startLine: number; endLine: number }): boolean {
            if (!contextRange || !range || uri.toString() !== document.uri.toString()) {
                return false
            }

            return contextRange.start.line <= range.startLine && contextRange.end.line >= range.endLine
        }

        // Allocate up to 40% of the maxChars budget to inlining previous section unless we have no
        // graph context
        const maxCharsForPreviousSections = sectionGraphContext ? maxChars * 0.4 : maxChars
        for (const historyContext of sectionHistory) {
            if (usedContextChars + historyContext.content.length > maxCharsForPreviousSections) {
                // We use continue here to test potentially smaller context snippets that might
                // still fit inside the budget
                continue
            }
            usedContextChars += historyContext.content.length
            context.push(historyContext)
        }

        if (sectionGraphContext) {
            const preciseContexts = hoverContextsToSnippets(
                sectionGraphContext.filter(context => !overlapsContextRange(URI.parse(context.uri), context.range))
            )
            for (const preciseContext of preciseContexts) {
                if (usedContextChars + preciseContext.content.length > maxChars) {
                    // We use continue here to test potentially smaller context snippets that might
                    // still fit inside the budget
                    continue
                }
                usedContextChars += preciseContext.content.length
                context.push(preciseContext)
            }
        }

        return context
    }

    private getLspContextForLine(
        document: vscode.TextDocument,
        line: number,
        recursion: number,
        abortSignal: CustomAbortSignal
    ): Promise<HoverContext[]> {
        const request = {
            document,
            line,
            recursion,
        }

        const res = this.cache.get(request)
        if (res) {
            return res
        }

        const range = document.lineAt(line).range

        let finished = false

        const promise = getGraphContextFromRange(document, range, abortSignal, recursion).then(response => {
            finished = true
            return response
        })

        // Remove the aborted promise from the cache
        abortSignal.addEventListener('abort', () => {
            if (!finished) {
                this.cache.delete(request)
            }
        })

        this.cache.set(request, promise)

        return promise
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    /**
     * When the cursor is moving into a new line, we want to fetch the context for the new line.
     */
    private onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
        if (!supportedLanguageId(event.textEditor.document.languageId)) {
            return
        }

        void this.getContextAtPosition(event.textEditor.document, event.selections[0].active, 0)
    }
}

interface GraphCacheParams {
    document: vscode.TextDocument
    line: number
    recursion: number
}
class GraphCache {
    private cache = new LRUCache<string, Promise<HoverContext[]>>({ max: 50 })

    private toCacheKey(key: GraphCacheParams): string {
        return `${key.document.uri.toString()}█${key.line}█${key.document.lineAt(key.line).text}█${key.recursion}`
    }

    public get(key: GraphCacheParams): Promise<HoverContext[]> | undefined {
        return this.cache.get(this.toCacheKey(key))
    }

    public set(key: GraphCacheParams, entry: Promise<HoverContext[]>): void {
        this.cache.set(this.toCacheKey(key), entry)
    }

    public delete(key: GraphCacheParams): void {
        this.cache.delete(this.toCacheKey(key))
    }
}

function hoverContextsToSnippets(contexts: HoverContext[]): SymbolContextSnippet[] {
    return dedupeWith(contexts.map(hoverContextToSnippets), context =>
        [context.symbol, context.fileName, context.content].join('\n')
    )
}

function hoverContextToSnippets(context: HoverContext): SymbolContextSnippet {
    return {
        fileName: path.normalize(vscode.workspace.asRelativePath(URI.parse(context.uri).fsPath)),
        symbol: context.symbolName,
        content: context.content.join('\n').trim(),
    }
}
