import { X } from 'lucide-react'
import type { FC } from 'react'
import React from 'react'

import type { Phase } from '../../../src/autoedits/analytics-logger/types'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { Badge } from '../../components/shadcn/ui/badge'
import { AutoeditDataSDK } from '../autoedit-data-sdk'
import { formatTime, type getDetailedTimingInfo, getStatusColor } from '../autoedit-ui-utils'

// Sub-component for header section
const EntryHeader: FC<{
    phase: Phase
    triggerKind: string
    timingInfo: ReturnType<typeof getDetailedTimingInfo>
    timestamp: number
    onToggleDetailedTiming: () => void
    showDetailedTiming: boolean
}> = ({ phase, triggerKind, timingInfo, timestamp, onToggleDetailedTiming, showDetailedTiming }) => (
    <div className="tw-flex tw-items-center tw-justify-between tw-w-full">
        <div className="tw-flex tw-items-center tw-gap-2">
            <Badge className={getStatusColor(phase)}>{phase}</Badge>
            <span className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">{triggerKind}</span>
        </div>
        <div className="tw-flex tw-items-center tw-gap-3">
            <button
                type="button"
                className="tw-text-xs tw-font-medium tw-text-gray-600 tw-dark:tw-text-gray-300 hover:tw-underline"
                onClick={e => {
                    e.stopPropagation()
                    onToggleDetailedTiming()
                }}
                title="Click to see detailed timing"
            >
                {timingInfo.predictionDuration || '—'}
            </button>
            <span className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">
                {formatTime(timestamp)}
            </span>
        </div>
    </div>
)

// Sub-component for detailed timing
const DetailedTiming: FC<{
    timingInfo: ReturnType<typeof getDetailedTimingInfo>
}> = ({ timingInfo }) => (
    <div className="tw-bg-gray-50 tw-dark:tw-bg-gray-800/50 tw-rounded tw-p-2 tw-my-1">
        <div className="tw-text-xs tw-font-medium tw-text-gray-700 tw-dark:tw-text-gray-300 tw-mb-1">
            Detailed Timing
        </div>
        <div className="tw-grid tw-grid-cols-2 tw-gap-x-4 tw-gap-y-1">
            {timingInfo.details.map(detail => (
                <React.Fragment key={`${detail.label}-${detail.value}`}>
                    <div className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">
                        {detail.label}:
                    </div>
                    <div className="tw-text-xs tw-font-mono tw-text-gray-600 tw-dark:tw-text-gray-300">
                        {detail.value}
                    </div>
                </React.Fragment>
            ))}
        </div>
    </div>
)

// Sub-component for file info
const FileInfo: FC<{
    filePath: string
    positionInfo: string
    languageId: string | null
}> = ({ filePath, positionInfo, languageId }) => (
    <div className="tw-flex tw-items-center tw-text-sm tw-text-gray-700 tw-dark:tw-text-gray-300">
        <span className="tw-font-medium">{filePath}</span>
        {positionInfo && (
            <>
                <span className="tw-mx-2">•</span>
                <span>{positionInfo}</span>
            </>
        )}
        {languageId && (
            <>
                <span className="tw-mx-2">•</span>
                <span className="tw-italic tw-text-xs tw-text-gray-500">{languageId}</span>
            </>
        )}
    </div>
)

// Sub-component for code preview
const CodePreview: FC<{
    codeText: string
    codeType: string
    decorationStats: string | null
    isCodeTruncated: boolean
    onToggleTruncation: (e: React.MouseEvent) => void
}> = ({ codeText, codeType, decorationStats, isCodeTruncated, onToggleTruncation }) => {
    const truncatedText = codeText.length > 80 ? codeText.substring(0, 80) + '...' : codeText

    return (
        <div className="tw-flex tw-flex-col tw-gap-1">
            <div className="tw-flex tw-justify-between tw-items-center">
                <span className="tw-text-xs tw-font-medium tw-text-gray-500 tw-dark:tw-text-gray-400">
                    {codeType === 'code-to-rewrite'
                        ? 'Code to Rewrite'
                        : codeType === 'prediction'
                          ? 'Prediction'
                          : 'No Code'}
                </span>
                <div className="tw-flex tw-items-center tw-gap-2">
                    {codeText.length > 80 && (
                        <button
                            type="button"
                            className="tw-text-xs tw-text-blue-500 hover:tw-underline"
                            onClick={onToggleTruncation}
                        >
                            {isCodeTruncated ? 'Show more' : 'Show less'}
                        </button>
                    )}
                    {decorationStats && (
                        <span className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">
                            {decorationStats}
                        </span>
                    )}
                </div>
            </div>
            <div className="tw-font-mono tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400 tw-bg-gray-50 tw-dark:tw-bg-gray-800/80 tw-px-2 tw-py-1 tw-rounded tw-whitespace-normal tw-break-all">
                {isCodeTruncated ? truncatedText : codeText}
            </div>
        </div>
    )
}

interface AutoeditEntryItemProps {
    entry: AutoeditRequestDebugState
    isSelected: boolean
    onSelect: (entryId: string) => void
}

// Main component
export const AutoeditListItem: FC<AutoeditEntryItemProps> = ({ entry, isSelected, onSelect }) => {
    // Extract all data from entry using the SDK
    const {
        phase,
        filePath,
        codeToRewrite = '',
        triggerKind,
        positionInfo,
        discardReason,
        languageId,
        decorationStats,
        timing,
    } = AutoeditDataSDK.extractAutoeditData(entry)

    // State management
    const [showDetailedTiming, setShowDetailedTiming] = React.useState(false)
    const [isCodeTruncated, setIsCodeTruncated] = React.useState(codeToRewrite.length > 200)

    // Calculate card classes based on selection state
    const cardClasses = `
        tw-border tw-border-gray-200 tw-dark:tw-border-gray-700
        tw-rounded-md tw-mb-2 tw-overflow-hidden tw-cursor-pointer
        tw-transition-colors tw-duration-150
        ${
            isSelected
                ? 'tw-bg-blue-50 tw-dark:tw-bg-blue-900/20 tw-border-blue-300 tw-dark:tw-border-blue-700'
                : 'tw-bg-white tw-dark:tw-bg-gray-800 hover:tw-bg-gray-50 dark:hover:tw-bg-gray-700/50'
        }
    `
        .trim()
        .replace(/\s+/g, ' ')

    return (
        <div
            className={cardClasses}
            onClick={() => onSelect(entry.state.requestId)}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    onSelect(entry.state.requestId)
                    e.preventDefault()
                }
            }}
        >
            <div className="tw-px-4 tw-py-3 tw-w-full">
                <div className="tw-grid tw-grid-cols-1 tw-w-full tw-gap-2">
                    {/* Header with status, timestamp, and latency */}
                    <EntryHeader
                        phase={phase}
                        triggerKind={triggerKind}
                        timingInfo={timing}
                        timestamp={entry.updatedAt}
                        onToggleDetailedTiming={() => setShowDetailedTiming(!showDetailedTiming)}
                        showDetailedTiming={showDetailedTiming}
                    />

                    {/* Detailed timing information (collapsible) */}
                    {showDetailedTiming && timing.details.length > 0 && (
                        <DetailedTiming timingInfo={timing} />
                    )}

                    {/* File and position info */}
                    <FileInfo filePath={filePath} positionInfo={positionInfo} languageId={languageId} />

                    {/* Code preview */}
                    <CodePreview
                        codeText={codeToRewrite}
                        codeType={'code-to-rewrite'}
                        decorationStats={decorationStats}
                        isCodeTruncated={isCodeTruncated}
                        onToggleTruncation={e => {
                            e.stopPropagation()
                            setIsCodeTruncated(!isCodeTruncated)
                        }}
                    />

                    {/* Discard reason if applicable */}
                    {discardReason && (
                        <div className="tw-flex tw-items-center tw-gap-1 tw-text-red-600 tw-text-xs tw-mt-1">
                            <X className="tw-h-3 tw-w-3" />
                            <span>{discardReason}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
