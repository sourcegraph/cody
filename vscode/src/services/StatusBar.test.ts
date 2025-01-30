import { allValuesFrom } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatusBarAlignment, vsCodeMocks } from '../testutils/mocks'
import { CodyStatusBar } from './StatusBar'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    StatusBarAlignment,
}))

describe('StatusBar loader debouncing', () => {
    let statusBar: CodyStatusBar
    let observedChanges: Promise<Set<any>[]>

    beforeEach(() => {
        vi.useFakeTimers()
        statusBar = CodyStatusBar.init()
        // Track all changes to the loaders collection
        observedChanges = allValuesFrom(statusBar['loaders'].changes).then(changes =>
            changes.map(set => new Set(set))
        )
    })

    afterEach(() => {
        statusBar?.dispose()
        vi.useRealTimers()
    })

    it('tracks loader mutations', async () => {
        statusBar.addLoader({ title: 'Test Loader' })
        statusBar['loaders'].complete()

        const states = await observedChanges
        // Initial empty state
        expect(states[0].size).toBe(0)
        // After adding loader
        expect(states[1].size).toBe(1)
    })
})
