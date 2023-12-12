/**
 * The protocol for communicating between Cody and local embeddings.
 */

export interface InitializeParams {
    codyGatewayEndpoint: string
    appIndexPath?: string
    indexPath: string
    chunkingPolicy?: ChunkingPolicy
}

export interface ChunkingPolicy {
    maxFileSizeBytes: number
    pathsToExcludeRegexp: string
}

export interface QueryParams {
    repoName: string
    query: string
}

export interface QueryResultSet {
    results: QueryResult[]
}

export interface QueryResult {
    fileName: string
    startLine: number
    endLine: number
    content: string
}

export interface IndexHealthRequest {
    // The name of the repository to scrutinize the index for. Note, this
    // is a repo name, like github.com/sourcegraph/cody, not a file path.
    repoName: string
}

export type IndexHealthResult = IndexHealthResultFound | IndexHealthResultNotFound

export interface IndexHealthResultFound {
    type: 'found'
    repoName: string
    format: 'App' | 'LocalEmbeddings'
    commit: string
    model: string
    dimension: number
    numItems: number
    numItemsDeleted: number
    numItemsNeedEmbedding: number
    numItemsFailed: number
    numFiles: number
}

export interface IndexHealthResultNotFound {
    type: 'notFound'
    repoName: string
}

export interface IndexRequest {
    repoPath: string
    mode: IndexRequestMode
}

export type IndexRequestMode = IndexRequestModeNew | IndexRequestModeContinue

export interface IndexRequestModeNew {
    type: 'new'
    model: string
    dimension: number
}

export interface IndexRequestModeContinue {
    type: 'continue'
}

export interface IndexResult {
    repoName: string
}

export interface LoadResult {
    repoName: string
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Requests = {
    'embeddings/echo': [string, string]
    // Instruct local embeddings to index the specified repository path.
    'embeddings/index': [IndexRequest, IndexResult]
    // Get statistics for the index for a given repository name.
    'embeddings/index-health': [IndexHealthRequest, IndexHealthResult]
    // Initializes the local embeddings service. You must call this first.
    'embeddings/initialize': [InitializeParams, {}]
    // Searches for and loads an index for the specified repository name.
    'embeddings/load': [string, LoadResult]
    // Queries loaded index.
    'embeddings/query': [QueryParams, QueryResultSet]
    // Sets the Sourcegraph access token.
    'embeddings/set-token': [string, {}]
    // Shuts down the local embeddings service.
    'embeddings/shutdown': [{}, {}]
}

export type ProgressValue = Progress | ProgressError | ProgressDone

export interface Progress {
    type: 'progress'
    currentPath: string
    repoName: string
    repoPath: string
    numItems: number
    totalItems: number
}

export interface ProgressDone {
    type: 'done'
    repoName: string
}

export interface ProgressError {
    type: 'error'
    repoName: string
    message: string
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Notifications = {
    'embeddings/progress': [ProgressValue]
}
