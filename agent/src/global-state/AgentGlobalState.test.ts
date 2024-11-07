import os from 'node:os'
import { CodyIDE } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentGlobalState, LocalStorageDB } from './AgentGlobalState'

describe('AgentGlobalState', () => {
    let globalState: AgentGlobalState

    beforeEach(async () => {
        globalState = await AgentGlobalState.initialize(CodyIDE.VSCode)
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

describe('LocalStorageDB', () => {
    let localStorageDB: LocalStorageDB

    beforeEach(() => {
        localStorageDB = new LocalStorageDB('testIDE', os.tmpdir())
    })

    afterEach(() => {
        localStorageDB.clear()
    })

    it('should set and get values correctly', () => {
        localStorageDB.set('testKey', 'testValue')
        expect(localStorageDB.get('testKey')).toBe('testValue')
    })

    it('should handle complex objects', () => {
        const complexObject = { a: 1, b: { c: 'test' }, d: [1, 2, 3] }
        localStorageDB.set('complexKey', complexObject)
        expect(localStorageDB.get('complexKey')).toEqual(complexObject)
    })

    it('should return undefined for non-existent keys', () => {
        expect(localStorageDB.get('nonExistentKey')).toBeUndefined()
    })

    it('should overwrite existing values', () => {
        localStorageDB.set('overwriteKey', 'initialValue')
        localStorageDB.set('overwriteKey', 'newValue')
        expect(localStorageDB.get('overwriteKey')).toBe('newValue')
    })

    it('should clear all stored values', () => {
        localStorageDB.set('key1', 'value1')
        localStorageDB.set('key2', 'value2')
        localStorageDB.clear()
        expect(localStorageDB.get('key1')).toBeUndefined()
        expect(localStorageDB.get('key2')).toBeUndefined()
    })

    it('should return all keys', () => {
        localStorageDB.set('key1', 'value1')
        localStorageDB.set('key2', 'value2')
        const keys = localStorageDB.keys()
        expect(keys).toContain('key1')
        expect(keys).toContain('key2')
        expect(keys.length).toBe(2)
    })

    it('should handle different data types', () => {
        localStorageDB.set('numberKey', 42)
        localStorageDB.set('booleanKey', true)
        localStorageDB.set('nullKey', null)
        expect(localStorageDB.get('numberKey')).toBe(42)
        expect(localStorageDB.get('booleanKey')).toBe(true)
        expect(localStorageDB.get('nullKey')).toBeUndefined()
    })

    it('should threat setting null values as removing the key', () => {
        localStorageDB.set('nullKey', null)
        expect(localStorageDB.get('nullKey')).toBeUndefined()
    })

    it('should threat setting undefined values as removing the key', () => {
        localStorageDB.set('undefinedKey', undefined)
        expect(localStorageDB.get('undefinedKey')).toBeUndefined()
    })

    it('should handle empty string value', () => {
        localStorageDB.set('emptyStringKey', '')
        expect(localStorageDB.get('emptyStringKey')).toBe('')
    })
})
