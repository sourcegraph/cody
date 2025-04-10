import type { AutoeditRequestDebugState } from './debug-store'
import type { AutoeditSessionStats, StatisticsEntry } from './session-stats'

export type AutoeditDebugMessageFromExtension = {
    type: 'updateEntries'
    entries: AutoeditRequestDebugState[]
    sessionStats: AutoeditSessionStats
    statsForLastNRequests: StatisticsEntry[]
}

export type AutoeditDebugMessageFromWebview =
    | { type: 'ready' }
    | {
        type: 'submitFeedback'
        entry: AutoeditRequestDebugState
        feedback: {
            expectedCode: string
            assertions: string
        }
    }

export interface VSCodeAutoeditDebugWrapper {
    postMessage: (message: AutoeditDebugMessageFromWebview) => void
    onMessage: (callback: (message: AutoeditDebugMessageFromExtension) => void) => () => void
}
