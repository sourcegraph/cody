interface CompletionStatistics {
    suggested: number
    accepted: number
}

let statistics: CompletionStatistics = {
    suggested: 0,
    accepted: 0,
}

export function getStatistics(): CompletionStatistics {
    return statistics
}

export function logSuggested(): void {
    statistics = { ...statistics, suggested: statistics.suggested + 1 }
    notifyAll()
}
export function logAccepted(): void {
    statistics = { ...statistics, accepted: statistics.accepted + 1 }
    notifyAll()
}

const listeners: Set<Listener> = new Set()
type Listener = () => void
type Unregister = () => void
export function registerChangeListener(listener: Listener): Unregister {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function notifyAll(): void {
    for (const listener of listeners) {
        listener()
    }
}
