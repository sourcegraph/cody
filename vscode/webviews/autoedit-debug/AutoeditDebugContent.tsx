import type { FC } from 'react'

import type { AutoeditDebugMessageFromExtension } from '../../src/autoedits/debugging/debug-protocol'

import { Accordion } from '../components/shadcn/ui/accordion'
import { AutoeditEntryItem } from './components/AutoeditEntryItem'
import { EmptyState } from './components/EmptyState'

/**
 * Props for the AutoeditDebugContent component
 */
interface AutoeditDebugContentProps {
    entries: AutoeditDebugMessageFromExtension['entries']
}

/**
 * React component for the Auto-Edits Debug panel content
 */
export const AutoeditDebugContent: FC<AutoeditDebugContentProps> = ({ entries }) => {
    return (
        <div className="tw-bg-white tw-dark:tw-bg-gray-900 tw-rounded-lg tw-shadow-md tw-p-6">
            <h1 className="tw-text-xl tw-font-bold tw-mb-4">Auto-Edits Debug Panel</h1>

            <div className="tw-mb-4">
                <p className="tw-text-sm">Total requests: {entries.length}</p>
            </div>

            {/* Grid Container with Column Headers */}
            {entries.length > 0 && (
                <div className="tw-grid tw-grid-cols-[100px_120px_90px_1fr_100px] tw-gap-0 tw-px-4 tw-py-2 tw-text-xs tw-font-medium tw-text-gray-500 tw-dark:tw-text-gray-400 tw-border-b tw-border-gray-200 tw-dark:tw-border-gray-700 tw-mb-2">
                    <div>REQUEST ID</div>
                    <div>STATUS</div>
                    <div>LATENCY</div>
                    <div className="tw-min-w-[200px] tw-max-w-[450px]">DESCRIPTION</div>
                    <div className="tw-text-right">TIMESTAMP</div>
                </div>
            )}

            <Accordion type="multiple" className="tw-w-full">
                {entries.map(entry => (
                    <AutoeditEntryItem key={entry.state.requestId} entry={entry} />
                ))}

                {entries.length === 0 && <EmptyState />}
            </Accordion>
        </div>
    )
}
