import { X } from 'lucide-react'
import type { FC } from 'react'
import React from 'react'

import type { Phase } from '../../../src/autoedits/analytics-logger/types'
import { AutoeditDataSDK } from '../../../src/autoedits/debug-panel/autoedit-data-sdk'
import type { getDetailedTimingInfo } from '../../../src/autoedits/debug-panel/autoedit-latency-utils'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'
import { Badge } from '../../components/shadcn/ui/badge'
import { getStatusColor } from '../phase-colors'

// Sub-component for header section
const EntryHeader: FC<{
    phase: Phase
    triggerKind: string
    timingInfo: ReturnType<typeof getDetailedTimingInfo>
    onToggleDetailedTiming: () => void
}> = ({ phase, triggerKind, timingInfo, onToggleDetailedTiming }) => (
    <div className="tw-flex tw-items-center tw-justify-between tw-w-full">
        <div className="tw-flex tw-items-center tw-gap-2">
            <Badge className={getStatusColor(phase)}>{phase}</Badge>
            <span className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">{triggerKind}</span>
        </div>
        <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">Total:</span>
            <button
                type="button"
                className="tw-text-xs tw-font-medium tw-text-gray-600 tw-dark:tw-text-gray-300 hover:tw-underline tw-text-left"
                onClick={e => {
                    e.stopPropagation()
                    onToggleDetailedTiming()
                }}
                title="Click to see detailed timing"
            >
                {timingInfo.predictionDuration || '—'}
            </button>
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
    fileName: string
    positionInfo: string
    inferenceTime?: string | null
    envoyUpstreamServiceTime?: string | null
}> = ({ fileName, positionInfo, inferenceTime, envoyUpstreamServiceTime }) => (
    <div className="tw-flex tw-items-center tw-justify-between tw-w-full tw-text-sm tw-text-gray-700 tw-dark:tw-text-gray-300">
        <div className="tw-flex tw-items-center">
            <span className="tw-font-medium">
                {`${fileName} ${positionInfo ? `:${positionInfo}` : ''}`}
            </span>
        </div>
        {inferenceTime && (
            <div className="tw-flex tw-items-center tw-gap-2">
                <span className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">Inference:</span>
                <span className="tw-text-xs tw-font-medium tw-text-gray-600 tw-dark:tw-text-gray-300">
                    {inferenceTime}
                </span>
            </div>
        )}
        {!inferenceTime && envoyUpstreamServiceTime && (
            <div className="tw-flex tw-items-center tw-gap-2">
                <span className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">
                    Envoy Latency:
                </span>
                <span className="tw-text-xs tw-font-medium tw-text-gray-600 tw-dark:tw-text-gray-300">
                    {envoyUpstreamServiceTime}
                </span>
            </div>
        )}
    </div>
)

// Sub-component for code preview
const CodePreview: FC<{ codeText: string }> = ({ codeText }) => {
    // Always truncate code text to 80 characters
    const truncatedText = codeText.length > 80 ? codeText.substring(0, 80) + '...' : codeText

    return (
        <div className="tw-flex tw-flex-col tw-gap-1">
            <div className="tw-font-mono tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400 tw-bg-gray-50 tw-dark:tw-bg-gray-800/80 tw-px-2 tw-py-1 tw-rounded tw-whitespace-normal tw-break-all">
                {truncatedText}
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
        fileName,
        codeToRewrite = '',
        triggerKind,
        positionInfo,
        discardReason,
        timing,
    } = AutoeditDataSDK.extractAutoeditData(entry)

    // State management
    const [showDetailedTiming, setShowDetailedTiming] = React.useState(false)

    // Calculate card classes based on selection state
    const cardClasses = `
        tw-border ${
            isSelected
                ? 'tw-border-blue-300 tw-dark:tw-border-blue-700'
                : 'tw-border-gray-200 tw-dark:tw-border-gray-700'
        }
        tw-rounded-md tw-mb-2 tw-overflow-hidden tw-cursor-pointer
        focus-visible:tw-outline-none
        ${
            isSelected
                ? 'tw-bg-blue-50 tw-dark:tw-bg-blue-900/20'
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
            onFocus={e => {
                // Prevent focus-related styling changes that might cause flickering
                if (!isSelected) {
                    onSelect(entry.state.requestId)
                }
            }}
        >
            <div className="tw-px-4 tw-py-3 tw-w-full">
                <div className="tw-grid tw-grid-cols-1 tw-w-full tw-gap-2">
                    {/* Header with status, and latency */}
                    <EntryHeader
                        phase={phase}
                        triggerKind={triggerKind}
                        timingInfo={timing}
                        onToggleDetailedTiming={() => setShowDetailedTiming(!showDetailedTiming)}
                    />

                    {/* Detailed timing information (collapsible) */}
                    {showDetailedTiming && timing.details.length > 0 && (
                        <DetailedTiming timingInfo={timing} />
                    )}

                    {/* File and position info */}
                    <FileInfo
                        fileName={fileName}
                        positionInfo={positionInfo}
                        inferenceTime={timing.inferenceTime}
                        envoyUpstreamServiceTime={timing.envoyUpstreamServiceTime}
                    />

                    {/* Code preview */}
                    <CodePreview codeText={codeToRewrite} />

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
