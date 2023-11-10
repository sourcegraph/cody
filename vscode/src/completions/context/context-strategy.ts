import * as vscode from 'vscode'

import { ContextRetriever } from '../types'

import { BfgRetriever } from './retrievers/bfg/bfg-retriever'
import { JaccardSimilarityRetriever } from './retrievers/jaccard-similarity/jaccard-similarity-retriever'
import { LspLightRetriever } from './retrievers/lsp-light/lsp-light-retriever'
import { SectionHistoryRetriever } from './retrievers/section-history/section-history-retriever'

export type ContextStrategy = 'lsp-light' | 'bfg' | 'jaccard-similarity' | 'none'

export interface ContextStrategyFactory extends vscode.Disposable {
    getStrategy(document: vscode.TextDocument): { name: ContextStrategy; retrievers: ContextRetriever[] }
}

export class DefaultContextStrategyFactory implements ContextStrategyFactory {
    private disposables: vscode.Disposable[] = []

    private localRetriever: ContextRetriever | undefined
    private graphRetriever: ContextRetriever | undefined

    constructor(
        private contextStrategy: ContextStrategy,
        createBfgRetriever?: () => BfgRetriever
    ) {
        switch (contextStrategy) {
            case 'none':
                break
            case 'bfg':
                // The bfg strategy uses jaccard similarity as a fallback if no results are found or
                // the language is not supported.
                this.localRetriever = new JaccardSimilarityRetriever()
                this.disposables.push(this.localRetriever)
                if (createBfgRetriever) {
                    this.graphRetriever = createBfgRetriever()
                    this.disposables.push(this.graphRetriever)
                }
                break
            case 'lsp-light':
                this.localRetriever = SectionHistoryRetriever.createInstance()
                this.graphRetriever = new LspLightRetriever()
                this.disposables.push(this.localRetriever, this.graphRetriever)
                break
            case 'jaccard-similarity':
                this.localRetriever = new JaccardSimilarityRetriever()
                this.disposables.push(this.localRetriever)
                break
        }
    }

    public getStrategy(document: vscode.TextDocument): { name: ContextStrategy; retrievers: ContextRetriever[] } {
        const retrievers: ContextRetriever[] = []

        switch (this.contextStrategy) {
            case 'none': {
                break
            }

            // The lsp-light strategy mixes local and graph based retrievers
            case 'lsp-light': {
                if (this.graphRetriever && this.graphRetriever.isSupportedForLanguageId(document.languageId)) {
                    retrievers.push(this.graphRetriever)
                }
                if (this.localRetriever) {
                    retrievers.push(this.localRetriever)
                }
                break
            }

            // The bfg strategy only uses the graph based retriever and falls through to the local
            // retriever if the graph based retriever is not available for the requested language.
            case 'bfg':
                if (this.graphRetriever && this.graphRetriever.isSupportedForLanguageId(document.languageId)) {
                    retrievers.push(this.graphRetriever)
                    break
                }

            case 'jaccard-similarity': {
                if (this.localRetriever) {
                    retrievers.push(this.localRetriever)
                }
                break
            }
        }
        return { name: this.contextStrategy, retrievers }
    }

    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose())
    }
}
