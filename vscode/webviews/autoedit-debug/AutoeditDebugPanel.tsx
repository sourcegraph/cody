import { type FC, useCallback, useEffect, useMemo, useState } from 'react'

import type { AutoeditRequestDebugState } from '../../src/autoedits/debug-panel/debug-store'
import type {
    AutoeditSessionStats,
    StatisticsEntry,
} from '../../src/autoedits/debug-panel/session-stats'

import { extractPhaseInfo } from '../../src/autoedits/debug-panel/autoedit-latency-utils'
import { AutoeditDetailView } from './components/AutoeditDetailView'
import { AutoeditListItem } from './components/AutoeditListItem'
import { EmptyState } from './components/EmptyState'
import { SessionStatsPage } from './session-stats/SessionStatsPage'

// All possible phases for filtering
const ALL_PHASES = [
    'All Phases',
    'Start',
    'Context Loaded',
    'Inference',
    'Network',
    'Post Processed',
    'Suggested',
    'Read',
    'Accepted',
    'Rejected',
    'Discarded',
]

export const AutoeditDebugPanel: FC<{
    entries: AutoeditRequestDebugState[]
    sessionStats?: AutoeditSessionStats
    statsForLastNRequests: StatisticsEntry[]
}> = ({ entries, sessionStats, statsForLastNRequests }) => {
    const [phaseFilter, setPhaseFilter] = useState<string>('All Phases')
    const [currentView, setCurrentView] = useState<'requests' | 'stats'>('requests')

    // Filter entries based on the selected phase
    const filteredEntries = useMemo(() => {
        if (phaseFilter === 'All Phases') {
            return entries
        }

        return entries.filter(entry => {
            const phases = extractPhaseInfo(entry)
            return phases.some(phase => phase.name === phaseFilter)
        })
    }, [entries, phaseFilter])

    // Ensure we always have a valid selectedEntryId that exists in filteredEntries
    const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

    // Update selectedEntryId when entries change or when the filter changes
    useEffect(() => {
        if (filteredEntries.length === 0) {
            setSelectedEntryId(null)
            return
        }

        // If the current selection is still valid, keep it
        if (
            selectedEntryId &&
            filteredEntries.some(entry => entry.state.requestId === selectedEntryId)
        ) {
            return
        }

        // Otherwise, select the first entry
        setSelectedEntryId(filteredEntries[0].state.requestId)
    }, [filteredEntries, selectedEntryId])

    const selectedEntry = useMemo(
        () => filteredEntries.find(entry => entry.state.requestId === selectedEntryId) || null,
        [filteredEntries, selectedEntryId]
    )

    // Handle entry selection
    const handleEntrySelect = useCallback((entryId: string) => {
        setSelectedEntryId(entryId)
    }, [])

    // Handle phase filter change
    const handlePhaseFilterChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        setPhaseFilter(event.target.value)
    }, [])

    // Toggle between requests and stats views
    const toggleView = useCallback(() => {
        setCurrentView(currentView === 'requests' ? 'stats' : 'requests')
    }, [currentView])

    // Get current index for navigation
    const currentIndex = useMemo(() => {
        if (!selectedEntryId) return -1
        return filteredEntries.findIndex(entry => entry.state.requestId === selectedEntryId)
    }, [selectedEntryId, filteredEntries])

    // Navigate to previous request
    const handlePrevious = useCallback(() => {
        if (currentIndex > 0) {
            setSelectedEntryId(filteredEntries[currentIndex - 1].state.requestId)
        }
    }, [currentIndex, filteredEntries])

    // Navigate to next request
    const handleNext = useCallback(() => {
        if (currentIndex >= 0 && currentIndex < filteredEntries.length - 1) {
            setSelectedEntryId(filteredEntries[currentIndex + 1].state.requestId)
        }
    }, [currentIndex, filteredEntries])

    // Close the detail view
    const handleClose = useCallback(() => {
        setSelectedEntryId(null)
    }, [])

    // Navigation state
    const hasPrevious = currentIndex > 0
    const hasNext = currentIndex >= 0 && currentIndex < filteredEntries.length - 1

    // Handle keyboard navigation
    useEffect(() => {
        // Only add keyboard listeners if an entry is selected
        if (!selectedEntryId) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp') {
                event.preventDefault()
                if (hasPrevious) handlePrevious()
            } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (hasNext) handleNext()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedEntryId, handlePrevious, handleNext, hasPrevious, hasNext])

    if (entries.length === 0 && currentView === 'requests') {
        return <EmptyState />
    }

    // Header with view toggle and phase filter
    const headerControls = (
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
            <div className="tw-flex tw-items-center tw-gap-2">
                <button
                    type="button"
                    className="tw-rounded tw-bg-gray-200 tw-py-1 tw-px-3 tw-text-sm tw-font-medium hover:tw-bg-gray-300 tw-dark:tw-bg-gray-700 tw-dark:hover:tw-bg-gray-600"
                    onClick={toggleView}
                >
                    {currentView === 'requests' ? 'View Session Stats' : 'View Requests'}
                </button>
                <span className="tw-text-sm tw-font-medium">
                    {currentView === 'requests' ? 'Requests' : 'Session Statistics'}
                </span>
            </div>

            {currentView === 'requests' && (
                <div className="tw-flex tw-items-center tw-gap-2">
                    <label htmlFor="phase-filter" className="tw-text-sm tw-font-medium">
                        Filter by phase:
                    </label>
                    <select
                        id="phase-filter"
                        className="tw-rounded tw-border tw-border-gray-300 tw-py-1 tw-px-2 tw-text-sm tw-dark:tw-border-gray-700 tw-dark:tw-bg-gray-800"
                        value={phaseFilter}
                        onChange={handlePhaseFilterChange}
                    >
                        {ALL_PHASES.map(phase => (
                            <option key={phase} value={phase}>
                                {phase}
                            </option>
                        ))}
                    </select>
                    {phaseFilter !== 'All Phases' && (
                        <div className="tw-text-sm tw-text-gray-500">
                            Showing {filteredEntries.length} of {entries.length} entries
                        </div>
                    )}
                </div>
            )}
        </div>
    )

    // If stats view is selected, render the stats page
    if (currentView === 'stats') {
        return (
            <div className="tw-h-full tw-overflow-y-auto">
                {headerControls}
                <SessionStatsPage
                    sessionStats={sessionStats}
                    statsForLastNRequests={statsForLastNRequests}
                />
            </div>
        )
    }

    // Render the entries list component to avoid duplication
    const entriesList = (
        <div className="tw-flex tw-flex-col tw-gap-2 tw-p-2">
            {filteredEntries.length === 0 ? (
                <div className="tw-p-4 tw-text-center tw-text-gray-500">
                    No entries match the selected phase filter
                </div>
            ) : (
                filteredEntries.map(entry => (
                    <AutoeditListItem
                        key={entry.state.requestId}
                        entry={entry}
                        isSelected={entry.state.requestId === selectedEntryId}
                        onSelect={handleEntrySelect}
                    />
                ))
            )}
        </div>
    )

    // When no entry is selected, display the list at full width
    if (!selectedEntry) {
        return (
            <div className="tw-h-full tw-overflow-y-auto">
                {headerControls}
                {entriesList}
            </div>
        )
    }

    // When an entry is selected, display the split view
    return (
        <div className="tw-flex tw-h-full tw-overflow-hidden">
            {/* List panel (left side) */}
            <div className="tw-w-2/5 tw-overflow-y-auto tw-border-r tw-border-gray-200 tw-dark:tw-border-gray-700 tw-pr-2">
                {headerControls}
                {entriesList}
            </div>

            {/* Detail panel (right side) */}
            <div className="tw-w-3/5 tw-overflow-y-auto tw-p-4">
                <AutoeditDetailView
                    entries={entries}
                    entry={selectedEntry}
                    onPrevious={handlePrevious}
                    onNext={handleNext}
                    onClose={handleClose}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                />
            </div>
        </div>
    )
}
