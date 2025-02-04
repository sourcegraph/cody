const typeScriptFamily = new Set(['typescript', 'typescriptreact'])
const javaScriptFamily = new Set(['javascript', 'javascriptreact'])

export enum RetrieverIdentifier {
    RecentEditsRetriever = 'recent-edits',
    JaccardSimilarityRetriever = 'jaccard-similarity',
    TscRetriever = 'tsc',
    LspLightRetriever = 'lsp-light',
    RecentCopyRetriever = 'recent-copy',
    DiagnosticsRetriever = 'diagnostics',
    RecentViewPortRetriever = 'recent-view-port',
    RulesRetriever = 'rules',
}

export interface ShouldUseContextParams {
    baseLanguageId: string
    languageId: string
}

/**
 * Returns true if the given language ID should be used as context for the base
 * language id.
 */
export function shouldBeUsedAsContext({ baseLanguageId, languageId }: ShouldUseContextParams): boolean {
    if (baseLanguageId === languageId) {
        return true
    }

    if (typeScriptFamily.has(baseLanguageId) && typeScriptFamily.has(languageId)) {
        return true
    }
    if (javaScriptFamily.has(baseLanguageId) && javaScriptFamily.has(languageId)) {
        return true
    }

    return false
}
