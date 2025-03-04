import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'

export const ContextInfoSection: FC<{ entry: AutoeditRequestDebugState }> = ({ entry }) => {
    if (
        !('payload' in entry.state) ||
        !('contextSummary' in entry.state.payload) ||
        !entry.state.payload.contextSummary
    ) {
        return null
    }

    const contextSummary = entry.state.payload.contextSummary

    // Helper function to format duration
    const formatDuration = (ms: number): string => {
        return `${ms.toFixed(2)}ms`
    }

    // Helper function to format character counts
    const formatChars = (chars: number): string => {
        return chars >= 1000 ? `${(chars / 1000).toFixed(1)}K` : chars.toString()
    }

    return (
        <div className="tw-flex tw-flex-col tw-gap-y-8">
            {/* Top-level overview */}
            <div className="tw-text-sm">
                <div className="tw-bg-gray-50 dark:tw-bg-gray-800/50 tw-rounded-md tw-p-4 tw-mb-4">
                    <div className="tw-grid tw-grid-cols-2 tw-gap-x-6 tw-gap-y-2">
                        {/* First column */}
                        <div className="tw-flex tw-flex-col tw-gap-y-2">
                            {'strategy' in contextSummary && (
                                <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                    <span className="tw-font-medium">Strategy:</span>
                                    <span>{String(contextSummary.strategy)}</span>
                                </div>
                            )}

                            {'duration' in contextSummary && (
                                <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                    <span className="tw-font-medium">Duration:</span>
                                    <span>{formatDuration(contextSummary.duration)}</span>
                                </div>
                            )}

                            {'totalChars' in contextSummary && (
                                <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                    <span className="tw-font-medium">Total Characters:</span>
                                    <span>{formatChars(contextSummary.totalChars)}</span>
                                </div>
                            )}

                            {'prefixChars' in contextSummary && (
                                <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                    <span className="tw-font-medium">Prefix Characters:</span>
                                    <span>{formatChars(contextSummary.prefixChars)}</span>
                                </div>
                            )}
                        </div>

                        {/* Second column */}
                        <div className="tw-flex tw-flex-col tw-gap-y-2">
                            {'suffixChars' in contextSummary && (
                                <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                    <span className="tw-font-medium">Suffix Characters:</span>
                                    <span>{formatChars(contextSummary.suffixChars)}</span>
                                </div>
                            )}

                            <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                <span className="tw-font-medium">Context Items:</span>
                                <span>
                                    {contextSummary && 'numContextItems' in contextSummary
                                        ? String(contextSummary.numContextItems)
                                        : '0'}
                                </span>
                            </div>

                            {'snippetContextItems' in contextSummary &&
                                contextSummary.snippetContextItems !== undefined && (
                                    <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                        <span className="tw-font-medium">Snippet Items:</span>
                                        <span>{String(contextSummary.snippetContextItems)}</span>
                                    </div>
                                )}

                            {'symbolContextItems' in contextSummary &&
                                contextSummary.symbolContextItems !== undefined && (
                                    <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                        <span className="tw-font-medium">Symbol Items:</span>
                                        <span>{String(contextSummary.symbolContextItems)}</span>
                                    </div>
                                )}

                            {'localImportsContextItems' in contextSummary && (
                                <div className="tw-grid tw-grid-cols-[1fr_auto] tw-items-baseline">
                                    <span className="tw-font-medium">Local Imports:</span>
                                    <span>{String(contextSummary.localImportsContextItems)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Retriever Statistics Grid */}
                {'retrieverStats' in contextSummary &&
                    Object.keys(contextSummary.retrieverStats).length > 0 && (
                        <div className="tw-mt-8">
                            <h3 className="tw-font-medium tw-mb-2 tw-text-base">Retriever Statistics</h3>
                            <div className="tw-overflow-x-auto tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded-md">
                                {/* Column Headers */}
                                <div className="tw-grid tw-grid-cols-[minmax(150px,auto)_repeat(4,minmax(100px,auto))] tw-gap-3 tw-p-2 tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-font-medium tw-text-xs tw-text-gray-700 tw-dark:tw-text-gray-300 tw-border-b tw-border-gray-200 tw-dark:tw-border-gray-700">
                                    <div>Retriever</div>
                                    <div>Suggested Items</div>
                                    <div>Retrieved Items</div>
                                    <div>Characters</div>
                                    <div>Duration</div>
                                </div>

                                {/* Retriever Rows */}
                                {Object.entries(contextSummary.retrieverStats).map(
                                    ([identifier, stats], index) => (
                                        <div
                                            key={identifier}
                                            className={`tw-grid tw-grid-cols-[minmax(150px,auto)_repeat(4,minmax(100px,auto))] tw-gap-3 tw-p-2 tw-items-center ${
                                                index % 2 === 0
                                                    ? 'tw-bg-white tw-dark:tw-bg-gray-900'
                                                    : 'tw-bg-gray-50 tw-dark:tw-bg-gray-800/50'
                                            }`}
                                        >
                                            <div className="tw-font-medium tw-text-sm">{identifier}</div>
                                            <div className="tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                                {stats.suggestedItems}
                                            </div>
                                            <div className="tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                                {stats.retrievedItems}
                                            </div>
                                            <div className="tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                                {formatChars(stats.retrieverChars)}
                                            </div>
                                            <div className="tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                                {formatDuration(stats.duration)}
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    )}
            </div>
        </div>
    )
}
