import { type FC, useState } from 'react'

import type { AutoeditRequestDebugState } from '../../src/autoedits/debug-panel/debug-store'

import { AutoeditDetailView } from './components/AutoeditDetailView'
import { AutoeditListItem } from './components/AutoeditListItem'
import { EmptyState } from './components/EmptyState'

export const AutoeditDebugPanel: FC<{ entries: AutoeditRequestDebugState[] }> = ({ entries }) => {
    const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
        entries.length > 0 ? entries[0].state.requestId : null
    )

    const selectedEntry = entries.find(entry => entry.state.requestId === selectedEntryId) || null

    // Handle entry selection
    const handleEntrySelect = (entryId: string) => {
        setSelectedEntryId(entryId)
    }

    // Navigate to previous request
    const handlePrevious = () => {
        if (!selectedEntryId || entries.length <= 1) return

        const currentIndex = entries.findIndex(entry => entry.state.requestId === selectedEntryId)
        if (currentIndex > 0) {
            setSelectedEntryId(entries[currentIndex - 1].state.requestId)
        }
    }

    // Navigate to next request
    const handleNext = () => {
        if (!selectedEntryId || entries.length <= 1) return

        const currentIndex = entries.findIndex(entry => entry.state.requestId === selectedEntryId)
        if (currentIndex < entries.length - 1) {
            setSelectedEntryId(entries[currentIndex + 1].state.requestId)
        }
    }

    // Close the detail view
    const handleClose = () => {
        setSelectedEntryId(null)
    }

    if (entries.length === 0) {
        return <EmptyState />
    }

    // Render the entries list component to avoid duplication
    const entriesList = (
        <div className="tw-flex tw-flex-col tw-gap-2 tw-p-2">
            {entries.map(entry => (
                <AutoeditListItem
                    key={entry.state.requestId}
                    entry={entry}
                    isSelected={entry.state.requestId === selectedEntryId}
                    onSelect={handleEntrySelect}
                />
            ))}
        </div>
    )

    // When no entry is selected, display the list at full width
    if (!selectedEntry) {
        return <div className="tw-h-full tw-overflow-y-auto">{entriesList}</div>
    }

    // When an entry is selected, display the split view
    return (
        <div className="tw-flex tw-h-full tw-overflow-hidden">
            {/* List panel (left side) */}
            <div className="tw-w-2/5 tw-overflow-y-auto tw-border-r tw-border-gray-200 tw-dark:tw-border-gray-700 tw-pr-2">
                {entriesList}
            </div>

            {/* Detail panel (right side) */}
            <div className="tw-w-3/5 tw-overflow-y-auto tw-p-4">
                <AutoeditDetailView
                    entry={selectedEntry}
                    onPrevious={handlePrevious}
                    onNext={handleNext}
                    onClose={handleClose}
                    hasPrevious={entries.findIndex(e => e.state.requestId === selectedEntryId) > 0}
                    hasNext={
                        entries.findIndex(e => e.state.requestId === selectedEntryId) <
                        entries.length - 1
                    }
                />
            </div>
        </div>
    )
}
