import type { QueryResultSet } from './embeddings-protocol'

interface InitializeParams {
    indexPath: string
    accessToken: string
}

interface ComputeFeaturesParams {
    repoPath: string
}

export interface RankContextItem {
    documentId: number
    filePath?: string | undefined | null
    content: string
    source?: string | undefined | null
}

interface RankItemsParams {
    repoPath: string
    query: string
    contextItems: RankContextItem[]
}

interface RankerPredictions {
    prediction: RankerPrediction[]
}

export interface RankerPrediction {
    document_id: number
    score: number
}

interface EmbeddingModelQueryParams {
    repoPath: string
    query: string
    modelName: string
    numResults: number
}

interface PrecomputeEmbeddingsParams {
    query: string
}

export type Requests = {
    'context-ranking/echo': [string, string]
    'context-ranking/initialize': [InitializeParams, string]
    'context-ranking/compute-features': [ComputeFeaturesParams, string]
    'context-ranking/rank-items': [RankItemsParams, RankerPredictions]
    'context-ranking/context-retriever-embedding': [EmbeddingModelQueryParams, QueryResultSet]
    'context-ranking/precompute-query-embedding': [PrecomputeEmbeddingsParams, string]
}

export type Notifications = {
    'context-ranking/rank-items-logger-payload': [string]
}
