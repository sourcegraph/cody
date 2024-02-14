interface InitializeParams {
    indexPath: string
}

interface ComputeFeaturesParams {
    repoPath: string
    bm25ChunkingStrategy: 'full-file-chunks'
}

export interface RankContextItem {
    index: number,
    filePath?: string,
    content: string,
    source?: string
}

interface RankItemsParams {
    repoPath: string,
    bm25ChunkingStrategy: 'full-file-chunks',
    query: string,
    contextItems: RankContextItem[],
    
}

export type Requests = {
    'context-ranking/echo': [string, string],
    'context-ranking/initialize': [InitializeParams, string],
    // try to load the features and if features does not exist, return false.
    'context-ranking/compute-features': [ComputeFeaturesParams, boolean],
    'context-ranking/rank-items': [RankItemsParams, RankContextItem[] ]
}

