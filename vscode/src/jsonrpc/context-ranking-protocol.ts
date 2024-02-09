interface InitializeParams {
    indexPath: string
}

interface ComputeFeaturesParams {
    repoPath: string
    BM25ChunkingStrategy: 'file-level-chunking'
}

export interface RankContextItem {
    index: number,
    filePath?: string,
    content: string,
    source?: string
}

interface RankItemsParams {
    rankContextItem: RankContextItem[],
    query: string
}

export type Requests = {
    'context-ranking/echo': [string, string],
    'context-ranking/initialize': [InitializeParams, string],
    // try to load the features and if features does not exist, return false. 
    'context-ranking/load-features': [string, boolean],
    'context-ranking/compute-features': [ComputeFeaturesParams, string],
    'context-ranking/rank-items': [RankItemsParams, RankItemsParams]
}

