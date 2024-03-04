import { describe, expect, it } from 'vitest'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/commands/types'
import { buildCodyCommandMap } from './get-commands'

describe('buildCodyCommandMap', () => {
    it('builds a command map from json file', () => {
        const file = {
            hello: {
                description: 'Say Hello World',
                type: 'workspace',
                prompt: 'Hello world',
            },
            bye: {
                description: 'Say Good-bye',
                type: 'user',
                key: 'bye',
                prompt: 'Bye!',
            },
            missing: {
                description: 'Missing prompt',
                type: 'user',
            },
        }
        // Turn file into Record<string, unknown>

        const commandMap = buildCodyCommandMap(CustomCommandType.Workspace, JSON.stringify(file))

        expect(commandMap.size).toBe(2)
        expect(commandMap.get('hello')).toStrictEqual({
            description: 'Say Hello World',
            type: 'workspace',
            key: 'hello',
            prompt: 'Hello world',
            mode: 'ask',
        })

        // No longer support slash commands
        expect(commandMap.get('/bye')?.type).toBe(undefined)
        // Command type set up by user should be replaced on build
        expect(commandMap.get('bye')?.type).toBe('workspace')
        // the /missing command will not be available due to the missing prompt
        // but it shouldn't break the map building process.
        expect(commandMap.get('/missing')?.type).toBe(undefined)
    })

    it('sets edit mode for edit commands correctly', () => {
        const file = {
            hello: {
                key: 'hello',
                prompt: 'Add hello world',
            },
            bye: {
                key: 'bye',
                prompt: 'Say good-bye',
            },
        }

        const commandMap = buildCodyCommandMap(CustomCommandType.User, JSON.stringify(file))

        // No longer support slash commands
        expect(commandMap.get('/hello')?.mode).toBe(undefined)
        expect(commandMap.get('hello')?.mode).toBe('ask')
        expect(commandMap.get('hello')?.type).toBe('user')

        // All slash commands should be prefixed with '/'
        expect(commandMap.get('bye')?.key).toBe('bye')
        expect(commandMap.get('hello')?.key).toBe('hello')
    })
})
