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
import { UnifiedDiffStrategy } from './retrievers/recent-user-actions/recent-edits-diff-helpers/unified-diff'
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
    | 'auto-edits'

export interface ContextStrategyFactory extends vscode.Disposable {
    getStrategy(
        document: vscode.TextDocument
    ): Promise<{ name: ContextStrategy; retrievers: ContextRetriever[] }>
}

export class DefaultContextStrategyFactory implements ContextStrategyFactory {
    private contextStrategySubscription: Unsubscribable

    private allLocalRetrievers: ContextRetriever[] | undefined
    private graphRetriever: ContextRetriever | undefined

    constructor(private contextStrategy: Observable<ContextStrategy>) {
        this.contextStrategySubscription = contextStrategy
            .pipe(
                createDisposables(contextStrategy => {
                    switch (contextStrategy) {
                        case 'none':
                            break
                        case 'recent-edits':
                            this.allLocalRetrievers = [
                                new RecentEditsRetriever({
                                    maxAgeMs: 60 * 1000,
                                    diffStrategyList: [
                                        new UnifiedDiffStrategy({ addLineNumbers: false }),
                                    ],
                                }),
                            ]
                            break
                        case 'recent-edits-1m':
                            this.allLocalRetrievers = [
                                new RecentEditsRetriever({
                                    maxAgeMs: 60 * 1000,
                                    diffStrategyList: [
                                        new UnifiedDiffStrategy({ addLineNumbers: false }),
                                    ],
                                }),
                            ]
                            break
                        case 'recent-edits-5m':
                            this.allLocalRetrievers = [
                                new RecentEditsRetriever({
                                    maxAgeMs: 60 * 5 * 1000,
                                    diffStrategyList: [
                                        new UnifiedDiffStrategy({ addLineNumbers: false }),
                                    ],
                                }),
                            ]
                            break
                        case 'recent-edits-mixed':
                            this.allLocalRetrievers = [
                                new RecentEditsRetriever({
                                    maxAgeMs: 60 * 1000,
                                    diffStrategyList: [
                                        new UnifiedDiffStrategy({ addLineNumbers: false }),
                                    ],
                                }),
                                new JaccardSimilarityRetriever(),
                            ]
                            break
                        case 'tsc-mixed':
                            this.allLocalRetrievers = [new JaccardSimilarityRetriever()]
                            this.graphRetriever = loadTscRetriever()
                            break
                        case 'tsc':
                            this.graphRetriever = loadTscRetriever()
                            break
                        case 'lsp-light':
                            this.allLocalRetrievers = [new JaccardSimilarityRetriever()]
                            this.graphRetriever = new LspLightRetriever()
                            break
                        case 'recent-copy':
                            this.allLocalRetrievers = [
                                new RecentCopyRetriever({
                                    maxAgeMs: 60 * 1000,
                                    maxSelections: 100,
                                }),
                            ]
                            break
                        case 'diagnostics':
                            this.allLocalRetrievers = [
                                new DiagnosticsRetriever({
                                    contextLines: 0,
                                    useXMLForPromptRendering: true,
                                }),
                            ]
                            break
                        case 'recent-view-port':
                            this.allLocalRetrievers = [
                                new RecentViewPortRetriever({
                                    maxTrackedViewPorts: 50,
                                    maxRetrievedViewPorts: 10,
                                }),
                            ]
                            break
                        case 'auto-edits':
                            this.allLocalRetrievers = [
                                new RecentEditsRetriever({
                                    maxAgeMs: 10 * 60 * 1000,
                                    diffStrategyList: [
                                        new UnifiedDiffStrategy({ addLineNumbers: true }),
                                    ],
                                }),
                                new DiagnosticsRetriever({
                                    contextLines: 0,
                                    useXMLForPromptRendering: false,
                                    useCaretToIndicateErrorLocation: false,
                                }),
                                new RecentViewPortRetriever({
                                    maxTrackedViewPorts: 50,
                                    maxRetrievedViewPorts: 10,
                                }),
                            ]
                            break
                        case 'jaccard-similarity':
                            this.allLocalRetrievers = [new JaccardSimilarityRetriever()]
                            break
                    }
                    return [
                        ...(this.allLocalRetrievers ?? []),
                        this.graphRetriever,
                        {
                            dispose: () => {
                                this.allLocalRetrievers = undefined
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
                if (this.allLocalRetrievers) {
                    retrievers.push(...this.allLocalRetrievers)
                }
                break
            }

            case 'tsc':
            case 'tsc-mixed':
                if (this.graphRetriever?.isSupportedForLanguageId(document.languageId)) {
                    retrievers.push(this.graphRetriever)
                }
                if (this.allLocalRetrievers) {
                    retrievers.push(...this.allLocalRetrievers)
                }
                break

            // The jaccard similarity strategies only uses the local retriever
            case 'jaccard-similarity':
            case 'recent-edits':
            case 'recent-edits-1m':
            case 'recent-edits-5m':
            case 'recent-copy':
            case 'diagnostics':
            case 'recent-view-port':
            case 'auto-edits':
            case 'recent-edits-mixed': {
                if (this.allLocalRetrievers) {
                    retrievers.push(...this.allLocalRetrievers)
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
