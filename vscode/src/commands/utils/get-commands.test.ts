import { describe, expect, it } from 'vitest'

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
                slashCommand: 'bye',
                prompt: 'Bye!',
            },
        }
        // Turn file into Record<string, unknown>

        const commandMap = buildCodyCommandMap('workspace', JSON.stringify(file))

        expect(commandMap.size).toBe(2)
        expect(commandMap.get('/hello')).toStrictEqual({
            description: 'Say Hello World',
            type: 'workspace',
            slashCommand: '/hello',
            prompt: 'Hello world',
            mode: 'ask',
        })

        // All keys should start with '/'
        expect(commandMap.get('bye')?.type).toBe(undefined)
        // Command type set up by user should be replaced on build
        expect(commandMap.get('/bye')?.type).toBe('workspace')
    })

    it('sets edit mode for edit commands correctly', () => {
        const file = {
            hello: {
                slashCommand: 'hello',
                prompt: '/edit Add hello world',
            },
            bye: {
                slashCommand: '/bye',
                prompt: 'Add hello world',
            },
        }

        const commandMap = buildCodyCommandMap('user', JSON.stringify(file))

        expect(commandMap.get('hello')?.mode).toBe(undefined)
        expect(commandMap.get('/hello')?.mode).toBe('edit')
        expect(commandMap.get('/hello')?.type).toBe('user')

        // All slash commands should be prefixed with '/'
        expect(commandMap.get('/bye')?.slashCommand).toBe('/bye')
        expect(commandMap.get('/hello')?.slashCommand).toBe('/hello')
    })
})
