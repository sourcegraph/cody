import { debounce } from 'lodash'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import { HoverContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'

import { getGraphContextFromRange } from '../../graph/graph'
import { ContextSnippet } from '../types'

import { GraphContextFetcher, supportedLanguageId } from './context-graph'
import { CustomAbortController, CustomAbortSignal } from './utils'

export class LspLightGraphCache implements vscode.Disposable, GraphContextFetcher {
    private disposables: vscode.Disposable[] = []
    private cache: GraphCache = new GraphCache()

    private lastRequestKey: string | null = null
    private abortLastRequest: () => void = () => {}

    public static instance: LspLightGraphCache | null = null
    public static createInstance(): LspLightGraphCache {
        if (this.instance) {
            throw new Error('SectionObserver has already been initialized')
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

        const start = performance.now()

        const [prevLineContext, currentLineContext] = await Promise.all([
            null,
            // this.getLspContextForLine(document, prevLine, 0, abortController.signal),
            this.getLspContextForLine(document, currentLine, 1, abortController.signal),
        ])

        console.log({
            duration: performance.now() - start,
            prevLineContext,
            currentLineContext,
        })

        if (maxChars === 0) {
            // This is likely just a preloading request, so we don't need to prepare the actual
            // context
            return []
        }

        return []
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
