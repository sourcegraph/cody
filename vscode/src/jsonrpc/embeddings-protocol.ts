/**
 * The protocol for communicating between Cody and local embeddings.
 */

export type HasIndexResult = IndexMetadata | null

export interface IndexMetadata {
    format: 'App' | 'LocalEmbeddings'
    indexFilePath: string
    repoName: string
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

export interface IndexRequest {
    path: string
    model: string
    dimension: number
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Requests = {
    'embeddings/echo': [string, string]
    // Query whether an index exists for the repo at the specified path.
    'embeddings/has-index': [string, HasIndexResult]
    // Instruct local embeddings to index the specified repository path.
    'embeddings/index': [IndexRequest, undefined]
    // Searches for and loads an index for the specified repository name.
    'embeddings/load': [string, boolean]
    // Queries loaded index.
    'embeddings/query': [string, QueryResultSet]
    // Sets the Sourcegraph access token.
    'embeddings/set-token': [string, undefined]
}

export type ProgressValue = Progress | ProgressError | 'Done'

export interface Progress {
    Progress: {
        currentPath: string
        repoName: string
        repoPath: string
        numItems: number
        totalItems: number
    }
}

export interface ProgressError {
    Error: string
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Notifications = {
    'embeddings/progress': [ProgressValue]
}
