// This should remain compatible with vscode.Disposable.
export interface Disposable {
    dispose(): void
}

// Provides a summary of context status and notifications when the status changes.
export interface ContextStatusProvider {
    onDidChangeStatus(callback: (provider: ContextStatusProvider) => void): Disposable
    get status(): ContextGroup[]
}

// Plain data types for describing context status. These are shared between
// the VScode webviews, the VScode extension, and cody-shared.

export type ContextProvider = EmbeddingsProvider | GraphProvider | SearchProvider

type EmbeddingsProvider = IndeterminateEmbeddingsProvider | LocalEmbeddingsProvider | RemoteEmbeddingsProvider

interface IndeterminateEmbeddingsProvider {
    kind: 'embeddings'
    type: 'indeterminate'
    state: 'indeterminate'
}

interface RemoteEmbeddingsProvider {
    kind: 'embeddings'
    type: 'remote'
    state: 'ready' | 'no-match'
    // The host name of the provider. This is displayed to the user *and*
    // used to construct a URL to the settings page.
    origin: string
    // The name of the repository in the remote provider. For example the
    // context group may be "~/projects/frobbler" but the remote name is
    // "host.example/universal/frobbler".
    remoteName: string
}

export interface LocalEmbeddingsProvider {
    kind: 'embeddings'
    type: 'local'
    state: 'indeterminate' | 'no-match' | 'unconsented' | 'indexing' | 'ready'
    errorReason?: 'not-a-git-repo' | 'git-repo-has-no-remote'
}

export interface SearchProvider {
    kind: 'search'
    state: 'unindexed' | 'indexing' | 'ready' | 'failed'
}

interface GraphProvider {
    kind: 'graph'
    state: 'indeterminate' | 'indexing' | 'ready'
}

export interface ContextGroup {
    name: string
    providers: ContextProvider[]
}

// TODO: rename to EnhancedContextStatusT
export interface EnhancedContextContextT {
    groups: ContextGroup[]
}
