import type { AutoeditRequestDebugState } from './debug-store'

export type AutoeditDebugMessageFromExtension = {
    type: 'updateEntries'
    entries: ReadonlyArray<AutoeditRequestDebugState>
}

export type AutoeditDebugMessageFromWebview = { type: 'ready' }

export interface VSCodeAutoeditDebugWrapper {
    postMessage: (message: AutoeditDebugMessageFromWebview) => void
    onMessage: (callback: (message: AutoeditDebugMessageFromExtension) => void) => () => void
}
