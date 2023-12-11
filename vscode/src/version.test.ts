import { describe, expect, it, vi } from 'vitest'

import { version } from './version'

vi.mock('vscode', () => ({
    extensions: {
        getExtension: vi.fn().mockReturnValue({ packageJSON: { version: '1.2.3' } }),
    },
}))

describe('version', () => {
    it('returns the version from the runtime extension info', () => {
        expect(version).toEqual('1.2.3')
    })
})
