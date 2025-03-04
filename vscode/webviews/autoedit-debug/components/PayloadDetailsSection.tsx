import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'

interface PayloadDetailsSectionProps {
    entry: AutoeditRequestDebugState
}

export const PayloadDetailsSection: FC<PayloadDetailsSectionProps> = ({ entry }) => {
    // Get trigger type as a string
    const getTriggerType = (entry: AutoeditRequestDebugState): string => {
        if ('payload' in entry.state && 'triggerKind' in entry.state.payload) {
            const triggerKind = entry.state.payload.triggerKind
            switch (triggerKind) {
                case 1:
                    return 'Automatic'
                case 2:
                    return 'Manual'
                case 3:
                    return 'Suggest Widget'
                case 4:
                    return 'Cursor'
                default:
                    return 'Unknown'
            }
        }
        return 'Unknown'
    }

    if (!('payload' in entry.state)) {
        return null
    }

    return (
        <CollapsiblePanel
            storageKey={`payload-${entry.state.requestId}`}
            title="Prompt & Payload Details"
            initialOpen={true}
        >
            <div className="tw-grid tw-grid-cols-2 tw-gap-4">
                <div>
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Language:</span>{' '}
                        {entry.state.payload.languageId}
                    </p>
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Model:</span> {entry.state.payload.model}
                    </p>
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Trigger Type:</span> {getTriggerType(entry)}
                    </p>
                    {'source' in entry.state.payload && (
                        <p className="tw-text-sm">
                            <span className="tw-font-medium">Source:</span>{' '}
                            {entry.state.payload.source === 1 ? 'Network' : 'Cache'}
                        </p>
                    )}
                </div>
                <div>
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Other Providers:</span>{' '}
                        {entry.state.payload.otherCompletionProviderEnabled ? 'Enabled' : 'Disabled'}
                    </p>
                    {'isFuzzyMatch' in entry.state.payload && (
                        <p className="tw-text-sm">
                            <span className="tw-font-medium">Fuzzy Match:</span>{' '}
                            {entry.state.payload.isFuzzyMatch ? 'Yes' : 'No'}
                        </p>
                    )}
                    {'traceId' in entry.state.payload && entry.state.payload.traceId && (
                        <p className="tw-text-sm tw-break-all">
                            <span className="tw-font-medium">Trace ID:</span>{' '}
                            {entry.state.payload.traceId}
                        </p>
                    )}
                </div>
            </div>

            {/* Prediction text */}
            {'prediction' in entry.state.payload || 'prediction' in entry.state ? (
                <CollapsiblePanel
                    storageKey={`prediction-${entry.state.requestId}`}
                    title="Prediction Text"
                    className="tw-mt-4"
                >
                    <pre className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-overflow-auto tw-max-h-[200px]">
                        {('prediction' in entry.state && entry.state.prediction) ||
                            ('payload' in entry.state &&
                                'prediction' in entry.state.payload &&
                                entry.state.payload.prediction) ||
                            'No prediction available'}
                    </pre>
                </CollapsiblePanel>
            ) : null}

            {/* Code to rewrite */}
            {'payload' in entry.state &&
            'codeToRewrite' in entry.state.payload &&
            entry.state.payload.codeToRewrite ? (
                <CollapsiblePanel
                    storageKey={`code-to-rewrite-${entry.state.requestId}`}
                    title="Code to Rewrite"
                    className="tw-mt-4"
                >
                    <pre className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-overflow-auto tw-max-h-[200px]">
                        {entry.state.payload.codeToRewrite}
                    </pre>
                </CollapsiblePanel>
            ) : null}
        </CollapsiblePanel>
    )
}
