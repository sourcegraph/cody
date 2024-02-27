interface InitializeParams {
    indexPath: string
    accessToken: string
}

interface ComputeFeaturesParams {
    repoPath: string
}

export interface RankContextItem {
    document_id: number
    filePath?: string
    content: string
    source?: string
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
    //todo: Change to camel case, when changing the protocol on bfg.
    document_id: number
    score: number
}

export type Requests = {
    'context-ranking/echo': [string, string]
    'context-ranking/initialize': [InitializeParams, string]
    'context-ranking/compute-features': [ComputeFeaturesParams, string]
    'context-ranking/rank-items': [RankItemsParams, RankerPredictions]
}
