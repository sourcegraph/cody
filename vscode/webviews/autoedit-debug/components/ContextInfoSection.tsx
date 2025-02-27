import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'

interface ContextInfoSectionProps {
    entry: AutoeditRequestDebugState
}

export const ContextInfoSection: FC<ContextInfoSectionProps> = ({ entry }) => {
    if (
        !('payload' in entry.state) ||
        !('contextSummary' in entry.state.payload) ||
        !entry.state.payload.contextSummary
    ) {
        return null
    }

    return (
        <CollapsiblePanel storageKey={`context-${entry.state.requestId}`} title="Context Information">
            <div className="tw-text-sm">
                <p>
                    <span className="tw-font-medium">Context Items:</span>{' '}
                    {entry.state.payload.contextSummary &&
                    'numContextItems' in entry.state.payload.contextSummary
                        ? String(entry.state.payload.contextSummary.numContextItems)
                        : '0'}
                </p>

                {'snippetContextItems' in entry.state.payload.contextSummary &&
                    entry.state.payload.contextSummary.snippetContextItems !== undefined && (
                        <p>
                            <span className="tw-font-medium">Snippet Items:</span>{' '}
                            {String(entry.state.payload.contextSummary.snippetContextItems)}
                        </p>
                    )}

                {'symbolContextItems' in entry.state.payload.contextSummary &&
                    entry.state.payload.contextSummary.symbolContextItems !== undefined && (
                        <p>
                            <span className="tw-font-medium">Symbol Items:</span>{' '}
                            {String(entry.state.payload.contextSummary.symbolContextItems)}
                        </p>
                    )}

                {'localImportsContextItems' in entry.state.payload.contextSummary && (
                    <p>
                        <span className="tw-font-medium">Local Imports:</span>{' '}
                        {entry.state.payload.contextSummary.localImportsContextItems !== undefined &&
                            String(entry.state.payload.contextSummary.localImportsContextItems)}
                    </p>
                )}
            </div>
        </CollapsiblePanel>
    )
}
