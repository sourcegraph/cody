import { describe, expect, it } from 'vitest'

import { parseInputToCommands } from './process-command-input'

describe('parseInputToCommands', () => {
    it('parses a command key', () => {
        const result = parseInputToCommands('/test')
        expect(result).toEqual({ key: '/test' })
    })

    it('parses a command key and additional instruction', () => {
        const result = parseInputToCommands('/test hello world')
        expect(result).toEqual({ key: '/test', request: 'hello world' })
    })

    it('returns key as userInput if no space', () => {
        const result = parseInputToCommands('/test')
        expect(result).toEqual({ key: '/test' })
    })

    it('parses input into key and additionalInstruction', () => {
        const { key, request } = parseInputToCommands('/test hello world')

        expect(key).toBe('/test')
        expect(request).toBe('hello world')
    })

    it('returns only key if no additional input', () => {
        const { key, request } = parseInputToCommands('/test')

        expect(key).toBe('/test')
        expect(request).toBe(undefined)
    })

    it('returns original input as an ask command if not a command', () => {
        const { key, request } = parseInputToCommands('hello world')

        expect(key).toBe('/ask')
        expect(request).toBe('hello world')
    })

    it('returns key and input with special characters', () => {
        const { key, request } = parseInputToCommands(`/example Explain the following code:
        \`\`\`
        console.log('hello world')
        \`\`\``)

        expect(key).toBe('/example')
        expect(request).toBe(`Explain the following code:
        \`\`\`
        console.log('hello world')
        \`\`\``)
    })
})
