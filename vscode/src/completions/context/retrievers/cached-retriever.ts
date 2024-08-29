import { type AutocompleteContextSnippet, logError, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import { getCurrentDocContext } from '../../get-current-doc-context'
import { InlineCompletionItemProviderConfigSingleton } from '../../inline-completion-item-provider-config-singleton'
import type { ContextRetriever, ContextRetrieverOptions } from '../../types'

export interface CachedRerieverOptions {
    cacheOptions?: LRUCache.Options<string, AutocompleteContextSnippet[], unknown>
    dependencyCacheOptions?: LRUCache.Options<string, Set<string>, unknown>
    precomputeOnCursorMove?: {
        debounceMs?: number
    }
}

type WorkspaceDependencies = Pick<
    typeof vscode.workspace,
    'onDidChangeTextDocument' | 'openTextDocument'
>

type WindowDependencies = Pick<
    typeof vscode.window,
    'onDidChangeTextEditorSelection' | 'visibleTextEditors' | 'tabGroups'
>

export abstract class CachedRetriever implements ContextRetriever {
    private cache: LRUCache<string, AutocompleteContextSnippet[]>
    private dependencies: LRUCache<string, Set<string>>
    private currentKey: string | null = null
    private subscriptions: Map<string, vscode.Disposable> = new Map()

    protected abortController: AbortController
    abstract identifier: string

    constructor(
        options?: CachedRerieverOptions,
        readonly workspace: WorkspaceDependencies = vscode.workspace,
        readonly window: WindowDependencies = vscode.window
    ) {
        this.abortController = new AbortController()
        this.cache = new LRUCache({ max: 500, ...options?.cacheOptions })
        this.dependencies = new LRUCache({
            max: 500,
            ...options?.dependencyCacheOptions,
            dispose: this.createDependencyInvalidator(options?.dependencyCacheOptions?.dispose),
        })

        // Only if specified by configuration, we will listen for cursor movements
        // and precompute retrievals
        if (options?.precomputeOnCursorMove) {
            this.subscribe(
                this.window.onDidChangeTextEditorSelection,
                this.onDidChangeTextEditorSelection,
                {
                    debounceMs: options.precomputeOnCursorMove.debounceMs,
                }
            )
        }
        this.subscribe(this.workspace.onDidChangeTextDocument, this.onDidChangeTextDocument)
    }

    // Converts the input arguments into a cache key. NOTE: the cache key
    // must be the different for different inputs that would result in different
    // outputs. If the cache key is the same, the cache will return the same result
    protected abstract toCacheKey(options: ContextRetrieverOptions): string

    /**
     * Retrieves autocomplete context for the given options, first checking the cache.
     * If not in cache, calls doRetrieval to fetch context, stores result in cache,
     * and returns result. Manages aborting previous retrieval on new request.
     */
    public async retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const key = this.toCacheKey(options)
        const cached = this.cache.get(key)
        if (cached) {
            return cached
        }
        if (this.currentKey) {
            this.abortController.abort()
        }
        this.currentKey = key
        const results = await this.doRetrieval(options)
        this.currentKey = null
        this.cache.set(key, results)
        return results
    }

    protected abstract doRetrieval(
        options: ContextRetrieverOptions
    ): Promise<AutocompleteContextSnippet[]>

    abstract isSupportedForLanguageId(languageId: string): boolean

    /**
     * Used to add a link between a representation of a dependency and a cache key
     * this cache will automatically listen for changes in those dependencies and
     * invalidate the cache key when they change
     *
     * @param dep The dependency the current cache entry depends on
     */
    public addDependency = (dep: string) => {
        if (!this.currentKey) {
            logError(this.constructor.name, 'Cannot add dependency outside of retrieval function')
            return
        }
        const keys = this.dependencies.get(dep)
        if (keys) {
            keys.add(this.currentKey)
        } else {
            this.dependencies.set(dep, new Set([this.currentKey]))
        }
    }

    /**
     * When a dependency updates, invalidate all cached results that
     * depend on that value
     *
     * @param dep The dependency which has been invalidated
     */
    private invalidateDependency = (dep: string) => {
        // invalidate all cached results that depend on evicted file
        for (const key of this.dependencies.get(dep) ?? []) {
            this.cache.delete(key)
        }
    }

    /**
     * Creates a function that will invalidate cached results
     * that depend on the given dependency when it is disposed.
     *
     * The created function will be called by the LRU cache when
     * entries are evicted, with the cache keys of entries that
     * depend on the evicted dependency.
     *
     * Allows optionally passing a custom dispose handler that
     * will be called in addition to the default invalidation.
     */
    private createDependencyInvalidator(
        dispose?: (cacheKeys: Set<string>, dep: string, reason: LRUCache.DisposeReason) => void
    ): LRUCache.Disposer<string, Set<string>> {
        return (cacheKeys: Set<string>, dep: string, reason: LRUCache.DisposeReason) => {
            if (dispose) {
                dispose(cacheKeys, dep, reason)
            }
            // invalidate all cached results that depend on evicted file
            for (const key of cacheKeys) {
                this.cache.delete(key)
            }
        }
    }

    // Virtual methods for emulating VSCode API
    get visibleTextEditors(): typeof vscode.window.visibleTextEditors {
        this.subscribe(vscode.window.onDidChangeVisibleTextEditors, this.onDidChangeVisibleTextEditors, {
            key: CacheKey.visibleTextEditors,
        })
        return this.window.visibleTextEditors
    }

    get tabGroups(): typeof this.window.tabGroups {
        this.subscribe(this.window.tabGroups.onDidChangeTabGroups, this.onDidChangeTabGroups, {
            key: CacheKey.tabGroups,
        })

        this.subscribe(this.window.tabGroups.onDidChangeTabs, this.onDidChangeTabs, {
            key: CacheKey.tabGroups,
        })
        return this.window.tabGroups
    }

    openTextDocument = (uri: vscode.Uri): Thenable<vscode.TextDocument | undefined> => {
        // Returns undefined if the uri is not a file system uri, which includes untitled files.
        // Trying to open a removed file will re-create the file and return a new document.
        if (uri.scheme !== 'file') {
            return Promise.resolve(undefined)
        }

        this.addDependency(uri.toString())
        return this.workspace.openTextDocument(uri)
    }

    // Subscription methods
    private onDidChangeVisibleTextEditors = (_: readonly vscode.TextEditor[]) => {
        // TODO: this currently invalidates all entries that depend on visibleTextEditors
        // when this handler fired. If we want to be more precise, we could track which
        // editors are actually be used by the retriever and then updating those
        this.invalidateDependency(CacheKey.visibleTextEditors)
    }

    private onDidChangeTabGroups = (_: vscode.TabGroupChangeEvent) => {
        // TODO: this currently invalidates all entries that depend on tabGroups
        // when this handler fired. If we want to be more precise, we could track which
        // tabGroups are actually be used by the retriever and then updating those
        this.invalidateDependency(CacheKey.tabGroups)
    }

    private onDidChangeTabs = (_: vscode.TabChangeEvent) => {
        // TODO: this currently invalidates all entries that depend on tabGroups
        // when this handler fired. If we want to be more precise, we could track which
        // tabs are actually be used by the retriever and then updating those
        this.invalidateDependency(CacheKey.tabGroups)
    }

    /**
     * Whenever there are changes to a document, all relevant contexts must be evicted
     */
    private onDidChangeTextDocument = (event: vscode.TextDocumentChangeEvent) => {
        if (event.contentChanges.length === 0 || event.document.uri.scheme !== 'file') {
            return
        }
        this.invalidateDependency(event.document.uri.toString())
    }

    /**
     * When the cursor is moving into a new line, we want to fetch the context for the new line.
     */
    private onDidChangeTextEditorSelection = (event: vscode.TextEditorSelectionChangeEvent) => {
        if (
            event.textEditor.document.uri.scheme !== 'file' ||
            !this.isSupportedForLanguageId(event.textEditor.document.languageId)
        ) {
            return
        }
        const document = event.textEditor.document
        const position = event.selections[0].active

        // Start a preloading requests as identifier by setting the maxChars to 0
        wrapInActiveSpan(`autocomplete.retrieve.${this.identifier}.preload`, span =>
            this.retrieve({
                document,
                position,
                hints: { maxChars: 0, maxMs: 150, isPreload: true },
                docContext: getCurrentDocContext({
                    document,
                    position,
                    maxPrefixLength:
                        InlineCompletionItemProviderConfigSingleton.configuration.providerConfig
                            .contextSizeHints.prefixChars,
                    maxSuffixLength:
                        InlineCompletionItemProviderConfigSingleton.configuration.providerConfig
                            .contextSizeHints.suffixChars,
                }),
            })
        )
    }

    /**
     * Subscribes to an event source and saves the subscription in the subscriptions map
     * Additionally can automatically track a dependency if this is being called through
     * This operation is idempotent so can be called multiple times and only one subscription
     * will be created
     */
    private subscribe = <T>(
        register: (fxn: (event: T) => void) => vscode.Disposable,
        handler: (event: T) => void,
        options: SubscriptionOptions = {}
    ) => {
        const { debounceMs, key } = options
        const name = handler.name
        // If we recieved a cache key, we should track that this cache entry
        // depends on that dependency
        if (key) {
            this.addDependency(key)
        }
        if (this.subscriptions.has(name) || !register) {
            return
        }
        // Unless they have specified no debounce, default to debouncing all handlers
        handler = debounceMs === 0 ? handler : debounce(handler, debounceMs ?? 100)
        this.subscriptions.set(name, register(handler))
    }

    public dispose() {
        this.cache.clear()
        this.dependencies.clear()
        vscode.Disposable.from(...this.subscriptions.values()).dispose()
    }
}

interface SubscriptionOptions {
    debounceMs?: number
    key?: CacheKey
}

enum CacheKey {
    visibleTextEditors = 'visible-text-editors',
    tabGroups = 'tab-groups',
}
