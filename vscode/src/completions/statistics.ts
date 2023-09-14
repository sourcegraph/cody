import { createSubscriber } from './utils'

const subscriber = createSubscriber<void>()

interface CompletionStatistics {
    suggested: number
    accepted: number
    rejected: number
}

let statistics: CompletionStatistics = {
    suggested: 0,
    accepted: 0,
    rejected: 0,
}

export function getStatistics(): CompletionStatistics {
    return statistics
}

export function logSuggested(): void {
    statistics = { ...statistics, suggested: statistics.suggested + 1 }
    subscriber.notify()
}
export function logAccepted(): void {
    statistics = { ...statistics, accepted: statistics.accepted + 1 }
    subscriber.notify()
}
export function logRejected(): void {
    statistics = { ...statistics, rejected: statistics.rejected + 1 }
    subscriber.notify()
}

export const registerChangeListener = subscriber.subscribe.bind(subscriber)
