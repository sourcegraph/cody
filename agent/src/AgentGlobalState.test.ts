import { afterEach } from 'node:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentGlobalState } from './AgentGlobalState'

let vfs: { [path: string]: string } = {}

// Mock out fs operations related to readFileSync, writeFileSync, and truncateSync
vi.mock('fs', () => ({
    readFileSync: (path: string) => {
        if (vfs[path]) {
            return vfs[path]
        }
        throw new Error('File not found')
    },
    writeFileSync: (path: string, data: string) => {
        vfs[path] = data
    },
    truncateSync: (path: string) => {
        delete vfs[path]
    },
}))

describe('AgentGlobalState', () => {
    let globalState: AgentGlobalState

    beforeEach(() => {
        globalState = new AgentGlobalState()
    })

    it('should store and retrieve values', () => {
        globalState.update('testKey', 'testValue')
        expect(globalState.get('testKey')).toBe('testValue')
    })

    it('should return undefined for non-existent keys', () => {
        expect(globalState.get('nonExistentKey')).toBeUndefined()
    })

    it('should update existing values', () => {
        globalState.update('updateKey', 'initialValue')
        globalState.update('updateKey', 'updatedValue')
        expect(globalState.get('updateKey')).toBe('updatedValue')
    })

    it('should handle different data types', () => {
        globalState.update('numberKey', 42)
        globalState.update('booleanKey', true)
        globalState.update('objectKey', { foo: 'bar' })

        expect(globalState.get('numberKey')).toBe(42)
        expect(globalState.get('booleanKey')).toBe(true)
        expect(globalState.get('objectKey')).toEqual({ foo: 'bar' })
    })

    it('should return default value if key does not exist', () => {
        expect(globalState.get('nonExistentKey', 'defaultValue')).toBe('defaultValue')
    })

    describe('persistence', () => {
        const PATH = 'testPath'
        beforeEach(() => {
            globalState = new AgentGlobalState(PATH)
        })

        afterEach(() => {
            vfs = {}
        })

        it('should persist values to disk', () => {
            globalState.update('persistedKey', 'persistedValue')

            const newGlobalState = new AgentGlobalState(PATH)

            expect(newGlobalState.get('persistedKey')).toBe('persistedValue')
        })

        it('should merge disk state with in-memory state', () => {
            globalState.update('key-1', 'value-1')
            globalState.update('key-2', 'value-2')

            const newGlobalState = new AgentGlobalState(PATH)
            newGlobalState.update('key-3', 'value-3')

            expect(newGlobalState.get('key-1')).toBe('value-1')
            expect(newGlobalState.get('key-2')).toBe('value-2')
            expect(newGlobalState.get('key-3')).toBe('value-3')
        })
    })
})
