import {
    type Unsubscribable,
    createDisposables,
    firstValueFrom,
    isDefined,
} from '@sourcegraph/cody-shared'
import type { Observable } from 'observable-fns'
import type * as vscode from 'vscode'
import type { ContextRetriever } from '../types'
import { JaccardSimilarityRetriever } from './retrievers/jaccard-similarity/jaccard-similarity-retriever'
import { LspLightRetriever } from './retrievers/lsp-light/lsp-light-retriever'
import { DiagnosticsRetriever } from './retrievers/recent-user-actions/diagnostics-retriever'
import { RecentCopyRetriever } from './retrievers/recent-user-actions/recent-copy'
import { RecentEditsRetriever } from './retrievers/recent-user-actions/recent-edits-retriever'
import { RecentViewPortRetriever } from './retrievers/recent-user-actions/recent-view-port'
import { loadTscRetriever } from './retrievers/tsc/load-tsc-retriever'

export type ContextStrategy =
    | 'lsp-light'
    | 'jaccard-similarity'
    | 'new-jaccard-similarity'
    | 'tsc'
    | 'tsc-mixed'
    | 'none'
    | 'recent-edits'
    | 'recent-edits-1m'
    | 'recent-edits-5m'
    | 'recent-edits-mixed'
    | 'recent-copy'
    | 'diagnostics'
    | 'recent-view-port'

export interface ContextStrategyFactory extends vscode.Disposable {
    getStrategy(
        document: vscode.TextDocument
    ): Promise<{ name: ContextStrategy; retrievers: ContextRetriever[] }>
}

export class DefaultContextStrategyFactory implements ContextStrategyFactory {
    private contextStrategySubscription: Unsubscribable

    private localRetriever: ContextRetriever | undefined
    private graphRetriever: ContextRetriever | undefined

    constructor(private contextStrategy: Observable<ContextStrategy>) {
        this.contextStrategySubscription = contextStrategy
            .pipe(
                createDisposables(contextStrategy => {
                    switch (contextStrategy) {
                        case 'none':
                            break
                        case 'recent-edits':
                            this.localRetriever = new RecentEditsRetriever(60 * 1000)
                            break
                        case 'recent-edits-1m':
                            this.localRetriever = new RecentEditsRetriever(60 * 1000)
                            break
                        case 'recent-edits-5m':
                            this.localRetriever = new RecentEditsRetriever(60 * 5 * 1000)
                            break
                        case 'recent-edits-mixed':
                            this.localRetriever = new RecentEditsRetriever(60 * 1000)
                            this.graphRetriever = new JaccardSimilarityRetriever()
                            break
                        case 'tsc-mixed':
                            this.localRetriever = new JaccardSimilarityRetriever()
                            this.graphRetriever = loadTscRetriever()
                            break
                        case 'tsc':
                            this.graphRetriever = loadTscRetriever()
                            break
                        case 'lsp-light':
                            this.localRetriever = new JaccardSimilarityRetriever()
                            this.graphRetriever = new LspLightRetriever()
                            break
                        case 'recent-copy':
                            this.localRetriever = new RecentCopyRetriever({
                                maxAgeMs: 60 * 1000,
                                maxSelections: 100,
                            })
                            break
                        case 'diagnostics':
                            this.localRetriever = new DiagnosticsRetriever()
                            break
                        case 'recent-view-port':
                            this.localRetriever = new RecentViewPortRetriever({
                                maxTrackedViewPorts: 50,
                                maxRetrievedViewPorts: 10,
                            })
                            break
                        case 'jaccard-similarity':
                            this.localRetriever = new JaccardSimilarityRetriever()
                            break
                    }
                    return [
                        this.localRetriever,
                        this.graphRetriever,
                        {
                            dispose: () => {
                                this.localRetriever = undefined
                                this.graphRetriever = undefined
                            },
                        },
                    ].filter(isDefined)
                })
            )
            .subscribe(() => {})
    }

    public async getStrategy(document: vscode.TextDocument): Promise<{
        name: ContextStrategy
        retrievers: ContextRetriever[]
    }> {
        const retrievers: ContextRetriever[] = []
        const contextStrategy = await firstValueFrom(this.contextStrategy)
        switch (contextStrategy) {
            case 'none': {
                break
            }

            // The lsp-light strategy mixes local and graph based retrievers
            case 'lsp-light': {
                if (this.graphRetriever?.isSupportedForLanguageId(document.languageId)) {
                    retrievers.push(this.graphRetriever)
                }
                if (this.localRetriever) {
                    retrievers.push(this.localRetriever)
                }
                break
            }

            case 'tsc':
            case 'tsc-mixed':
                if (this.graphRetriever?.isSupportedForLanguageId(document.languageId)) {
                    retrievers.push(this.graphRetriever)
                }
                if (this.localRetriever) {
                    retrievers.push(this.localRetriever)
                }
                break

            // The jaccard similarity strategies only uses the local retriever
            case 'jaccard-similarity':
            case 'recent-edits':
            case 'recent-edits-1m':
            case 'recent-edits-5m':
            case 'recent-copy':
            case 'diagnostics':
            case 'recent-view-port': {
                if (this.localRetriever) {
                    retrievers.push(this.localRetriever)
                }
                break
            }
            case 'recent-edits-mixed': {
                if (this.localRetriever) {
                    retrievers.push(this.localRetriever)
                }
                if (this.graphRetriever?.isSupportedForLanguageId(document.languageId)) {
                    retrievers.push(this.graphRetriever)
                }
                break
            }
        }
        return { name: contextStrategy, retrievers }
    }

    public dispose(): void {
        this.contextStrategySubscription.unsubscribe()
    }
}
