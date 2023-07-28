import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

/**
 * Tracks the last change (if any) to recently changed text documents.
 */
export interface LastChangeTracker {
    lastChange(uri: URI): ChangeType | null
}

export type ChangeType = 'add' | 'del'

export function createLastChangeTracker(): LastChangeTracker & vscode.Disposable {
    const lastChanges = new LRUCache<string, ChangeType>({ max: 10 })

    const disposable = vscode.workspace.onDidChangeTextDocument(event =>
        lastChanges.set(event.document.uri.toString(), event.contentChanges.at(-1)?.text ? 'add' : 'del')
    )

    return {
        lastChange: (uri: URI) => lastChanges.get(uri.toString()) ?? null,
        dispose: () => {
            disposable.dispose()
        },
    }
}

/** For use in tests only. */
export const NOOP_LAST_CHANGE_TRACKER: LastChangeTracker = {
    lastChange: () => null,
}
