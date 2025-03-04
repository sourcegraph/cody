import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'
import { AccordionContent, AccordionItem, AccordionTrigger } from '../../components/shadcn/ui/accordion'
import { Badge } from '../../components/shadcn/ui/badge'

import { ContextInfoSection } from './ContextInfoSection'
import { DecorationDetailsSection } from './DecorationDetailsSection'
import { DiscardInfoSection } from './DiscardInfoSection'
import { PayloadDetailsSection } from './PayloadDetailsSection'
import { TechnicalDetailsSection } from './TechnicalDetailsSection'
import { TimelineSection } from './TimelineSection'
import { calculateDuration, formatLatency, formatTime, getStatusColor } from './utils'

interface AutoeditEntryItemProps {
    entry: AutoeditRequestDebugState
}

export const AutoeditEntryItem: FC<AutoeditEntryItemProps> = ({ entry }) => {
    // Helper to get start time, which might be in different properties based on state phase
    const getStartTime = (entry: AutoeditRequestDebugState): number => {
        const { state } = entry
        if ('startedAt' in state) {
            return state.startedAt
        }
        return entry.updatedAt
    }

    // Helper to get a summary for an entry
    const getEntrySummary = (entry: AutoeditRequestDebugState): string => {
        const { state } = entry

        // Get file path and position information if available
        let locationInfo = ''
        if ('document' in state && state.document && 'position' in state && state.position) {
            locationInfo += `At line ${state.position.line + 1}`
        }

        // Get language and model information if available
        let modelInfo = ''
        if ('payload' in state && 'languageId' in state.payload) {
            modelInfo = `${state.payload.languageId}`

            if ('model' in state.payload) {
                modelInfo += ` (${state.payload.model})`
            }
        }

        // Get timing information
        let timingInfo = ''
        if ('payload' in state && 'latency' in state.payload) {
            timingInfo = `${formatLatency(state.payload.latency)}`
        } else if (state.phase === 'suggested' && 'suggestedAt' in state) {
            timingInfo = calculateDuration(getStartTime(entry), state.suggestedAt)
        } else if (state.phase === 'accepted' && 'acceptedAt' in state) {
            timingInfo = calculateDuration(getStartTime(entry), state.acceptedAt)
        }

        // Info about trigger kind
        let triggerInfo = ''
        if ('payload' in state && 'triggerKind' in state.payload) {
            // Convert numeric triggerKind back to readable string
            const triggerMap: Record<number, string> = {
                1: 'automatic',
                2: 'manual',
                3: 'suggestWidget',
                4: 'cursor',
            }
            const trigger = triggerMap[state.payload.triggerKind] || 'unknown'
            triggerInfo = `Triggered ${trigger}`
        }

        // Combine information pieces
        const infoParts = [locationInfo, modelInfo, triggerInfo, timingInfo].filter(Boolean)

        if (infoParts.length > 0) {
            return infoParts.join(', ')
        }

        // If no specific info is available, return a generic placeholder
        return 'Edit details unavailable'
    }

    // Extract a preview of the prediction text
    const getPredictionPreview = (entry: AutoeditRequestDebugState): string => {
        // Check if prediction is directly in the state (PostProcessedState and later phases)
        if ('prediction' in entry.state && typeof entry.state.prediction === 'string') {
            const prediction = entry.state.prediction
            return prediction.length > 50 ? prediction.substring(0, 47) + '...' : prediction
        }

        // Check if codeToRewrite is available (in StartedState)
        if (
            'payload' in entry.state &&
            'codeToRewrite' in entry.state.payload &&
            typeof entry.state.payload.codeToRewrite === 'string'
        ) {
            const codeToRewrite = entry.state.payload.codeToRewrite
            return `Code to edit: ${
                codeToRewrite.length > 40 ? codeToRewrite.substring(0, 37) + '...' : codeToRewrite
            }`
        }

        // If we reach LoadedState, prediction might be in the payload
        if (
            'payload' in entry.state &&
            'prediction' in entry.state.payload &&
            typeof entry.state.payload.prediction === 'string'
        ) {
            const prediction = entry.state.payload.prediction
            return prediction.length > 50 ? prediction.substring(0, 47) + '...' : prediction
        }

        return 'No prediction available'
    }

    return (
        <AccordionItem
            key={entry.state.requestId}
            value={entry.state.requestId}
            className="tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded-md tw-mb-2 tw-overflow-hidden"
        >
            <AccordionTrigger className="tw-px-4 tw-py-3 tw-grid tw-grid-cols-[100px_120px_90px_1fr_100px] tw-gap-0 tw-items-center tw-w-full tw-text-left">
                {/* Request ID column */}
                <div className="tw-font-mono tw-text-xs">{entry.state.requestId.substring(0, 8)}...</div>

                {/* Status column */}
                <div>
                    <Badge className={getStatusColor(entry.state.phase)}>{entry.state.phase}</Badge>
                </div>

                {/* Latency column */}
                <div className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">
                    {'payload' in entry.state && 'latency' in entry.state.payload
                        ? formatLatency(entry.state.payload.latency)
                        : '—'}
                </div>

                {/* Description column */}
                <div className="tw-flex tw-flex-col tw-min-w-[200px] tw-max-w-[450px]">
                    <div className="tw-text-sm tw-truncate">{getEntrySummary(entry)}</div>
                    <div className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400 tw-truncate">
                        {getPredictionPreview(entry)}
                    </div>
                </div>

                {/* Timestamp column */}
                <div className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400 tw-text-right">
                    {formatTime(entry.updatedAt)}
                </div>
            </AccordionTrigger>

            <AccordionContent className="tw-p-4">
                <div className="tw-grid tw-grid-cols-1 tw-gap-4">
                    {/* Header Information */}
                    <div className="tw-flex tw-items-center tw-justify-between tw-mb-4">
                        <div>
                            <h3 className="tw-text-lg tw-font-semibold">
                                Request ID: {entry.state.requestId}
                            </h3>
                            <p className="tw-text-sm tw-text-gray-500 tw-dark:tw-text-gray-400">
                                {getEntrySummary(entry)}
                            </p>
                            <p className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400 tw-mt-1">
                                {getPredictionPreview(entry)}
                            </p>
                        </div>
                        <Badge className={getStatusColor(entry.state.phase)}>{entry.state.phase}</Badge>
                    </div>

                    {/* Timeline section */}
                    <CollapsiblePanel
                        storageKey={`timeline-${entry.state.requestId}`}
                        title="Timeline & State Transitions"
                        initialOpen={true}
                    >
                        <TimelineSection entry={entry} />
                    </CollapsiblePanel>

                    {/* Prompt & Payload Details */}
                    <PayloadDetailsSection entry={entry} />

                    {/* Context Information */}
                    <ContextInfoSection entry={entry} />

                    {/* Visual & Decoration Details */}
                    <DecorationDetailsSection entry={entry} />

                    {/* Technical & Latency Details */}
                    <TechnicalDetailsSection entry={entry} />

                    {/* Discard Information */}
                    <DiscardInfoSection entry={entry} />
                </div>
            </AccordionContent>
        </AccordionItem>
    )
}
