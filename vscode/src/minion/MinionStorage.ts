import type { AuthStatus } from '@sourcegraph/cody-shared'
import { localStorage } from '../services/LocalStorageProvider'
import type { MinionSession } from './action'

interface StoredSessionState {
    session: MinionSession
}

export class MinionStorage {
    private minionRuns: { [id: string]: StoredSessionState } = {}

    public async save(authStatus: AuthStatus, state: StoredSessionState): Promise<void> {
        this.minionRuns[state.session.id] = state
        await localStorage.setMinionHistory(authStatus, serializeRuns(this.minionRuns))
    }

    public async listIds(authStatus: AuthStatus): Promise<string[]> {
        this.refreshFromStorage(authStatus)
        return Object.keys(this.minionRuns).toSorted().toReversed()
    }

    public async load(authStatus: AuthStatus, id: string): Promise<StoredSessionState | null> {
        this.refreshFromStorage(authStatus)
        return this.minionRuns[id]
    }

    public async clear(authStatus: AuthStatus): Promise<void> {
        this.minionRuns = {}
        await localStorage.setMinionHistory(authStatus, serializeRuns(this.minionRuns))
    }

    private async refreshFromStorage(authStatus: AuthStatus): Promise<void> {
        const rawRuns = localStorage.getMinionHistory(authStatus)
        if (rawRuns === null) {
            this.minionRuns = {}
            return
        }
        try {
            this.minionRuns = unserializeRuns(rawRuns)
        } catch (error) {
            throw new Error(`Failed to parse minion history: ${error}`)
        }
    }
}

function serializeRuns(m: { [id: string]: StoredSessionState }): string {
    return JSON.stringify(m)
}

// TODO(beyang): make more robust to schema changes
function unserializeRuns(serializedMinionRuns: string): { [id: string]: StoredSessionState } {
    const maybe: { [id: string]: StoredSessionState } = JSON.parse(serializedMinionRuns)
    for (const val of Object.values(maybe)) {
        if (!val.session) {
            return {}
        }
    }
    return maybe
}
