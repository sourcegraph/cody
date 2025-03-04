import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'

interface DecorationDetailsSectionProps {
    entry: AutoeditRequestDebugState
}

export const DecorationDetailsSection: FC<DecorationDetailsSectionProps> = ({ entry }) => {
    if (
        !('payload' in entry.state) ||
        !('decorationStats' in entry.state.payload) ||
        !entry.state.payload.decorationStats
    ) {
        return null
    }

    return (
        <CollapsiblePanel
            storageKey={`decoration-${entry.state.requestId}`}
            title="Visual & Decoration Details"
        >
            <div className="tw-grid tw-grid-cols-2 tw-gap-4">
                <div>
                    <h4 className="tw-font-medium tw-mb-2">Decoration Stats</h4>
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Added Lines:</span>{' '}
                        {entry.state.payload.decorationStats &&
                        'lineCountAdded' in entry.state.payload.decorationStats
                            ? String(entry.state.payload.decorationStats.lineCountAdded)
                            : '0'}
                    </p>
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Modified Lines:</span>{' '}
                        {entry.state.payload.decorationStats &&
                        'lineCountModified' in entry.state.payload.decorationStats
                            ? String(entry.state.payload.decorationStats.lineCountModified)
                            : '0'}
                    </p>
                    <p className="tw-text-sm">
                        <span className="tw-font-medium">Removed Lines:</span>{' '}
                        {entry.state.payload.decorationStats &&
                        'lineCountRemoved' in entry.state.payload.decorationStats
                            ? String(entry.state.payload.decorationStats.lineCountRemoved)
                            : '0'}
                    </p>
                </div>

                {'inlineCompletionStats' in entry.state.payload &&
                    entry.state.payload.inlineCompletionStats && (
                        <div>
                            <h4 className="tw-font-medium tw-mb-2">Inline Completion Stats</h4>
                            <p className="tw-text-sm">
                                <span className="tw-font-medium">Line Count:</span>{' '}
                                {entry.state.payload.inlineCompletionStats.lineCount || 0}
                            </p>
                            <p className="tw-text-sm">
                                <span className="tw-font-medium">Char Count:</span>{' '}
                                {entry.state.payload.inlineCompletionStats.charCount || 0}
                            </p>
                        </div>
                    )}
            </div>
        </CollapsiblePanel>
    )
}
