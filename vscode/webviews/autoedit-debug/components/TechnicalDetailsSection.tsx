import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'
import { formatLatency } from './utils'

interface TechnicalDetailsSectionProps {
    entry: AutoeditRequestDebugState
}

export const TechnicalDetailsSection: FC<TechnicalDetailsSectionProps> = ({ entry }) => {
    if (!('payload' in entry.state)) {
        return null
    }

    return (
        <CollapsiblePanel storageKey={`technical-${entry.state.requestId}`} title="Technical Details">
            <div className="tw-grid tw-grid-cols-2 tw-gap-4">
                {'latency' in entry.state.payload && (
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Latency:</span>{' '}
                        {formatLatency(entry.state.payload.latency)}
                    </p>
                )}

                {'upstreamLatency' in entry.state.payload && entry.state.payload.upstreamLatency && (
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Upstream Latency:</span>{' '}
                        {formatLatency(entry.state.payload.upstreamLatency)}
                    </p>
                )}

                {'gatewayLatency' in entry.state.payload &&
                    entry.state.payload.gatewayLatency !== undefined && (
                        <p className="tw-text-sm">
                            <span className="tw-font-medium">Gateway Latency:</span>{' '}
                            {formatLatency(entry.state.payload.gatewayLatency)}
                        </p>
                    )}

                {'responseHeaders' in entry.state.payload && entry.state.payload.responseHeaders && (
                    <CollapsiblePanel
                        storageKey={`headers-${entry.state.requestId}`}
                        title="Response Headers"
                        className="tw-mt-4 tw-col-span-2"
                    >
                        <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-overflow-auto tw-max-h-[150px]">
                            {Object.entries(entry.state.payload.responseHeaders).map(([key, value]) => (
                                <div key={key} className="tw-mb-1">
                                    <span className="tw-font-medium">{key}:</span> {value}
                                </div>
                            ))}
                        </div>
                    </CollapsiblePanel>
                )}
            </div>
        </CollapsiblePanel>
    )
}
