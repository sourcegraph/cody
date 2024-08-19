import { CodyIDE } from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgentGlobalState } from './AgentGlobalState'

describe('AgentGlobalState', () => {
    let globalState: AgentGlobalState

    beforeEach(() => {
        globalState = new AgentGlobalState(CodyIDE.VSCode)
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
})
