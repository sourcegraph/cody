import type { AutoeditFeedbackData } from '../analytics-logger/types'
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
          feedback: AutoeditFeedbackData
      }

export interface VSCodeAutoeditDebugWrapper {
    postMessage: (message: AutoeditDebugMessageFromWebview) => void
    onMessage: (callback: (message: AutoeditDebugMessageFromExtension) => void) => () => void
}
