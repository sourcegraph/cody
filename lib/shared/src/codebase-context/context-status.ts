import type { URI } from 'vscode-uri'

// This should remain compatible with vscode.Disposable.
export interface Disposable {
    dispose(): void
}

// Plain data types for describing context status. These are shared between
// the VScode webviews, the VScode extension, and cody-shared.

export type ContextProvider = LocalEmbeddingsProvider | SearchProvider

export interface RemoteSearchProvider {
    kind: 'search'
    type: 'remote'
    state: 'ready' | 'no-match'
    id: string
    // If 'manual' the user picked this context source manually. If 'auto' the
    // context source was included because the IDE detected the repo and
    // included it.
    inclusion: 'auto' | 'manual'

    /**
     * Whether the item is excluded by Cody Ignore.
     */
    isIgnored: boolean
}

export type EmbeddingsProvider = 'sourcegraph'

export interface LocalEmbeddingsProvider {
    kind: 'embeddings'
    state: 'indeterminate' | 'no-match' | 'unconsented' | 'indexing' | 'ready'
    errorReason?: 'not-a-git-repo' | 'git-repo-has-no-remote'
    embeddingsAPIProvider: EmbeddingsProvider
}

export type SearchProvider = LocalSearchProvider | RemoteSearchProvider

export interface LocalSearchProvider {
    kind: 'search'
    type: 'local'
    state: 'unindexed' | 'indexing' | 'ready' | 'failed'
}

export interface ContextGroup {
    /** The directory that this context group represents. */
    dir?: URI

    /**
     * Usually `basename(dir)`.
     *
     * TODO(sqs): when old remote embeddings code is removed, remove this field and compute it as
     * late as possible for presentation only.
     */
    displayName: string

    providers: ContextProvider[]
}

// TODO: rename to EnhancedContextStatusT
export interface EnhancedContextContextT {
    groups: ContextGroup[]
}
