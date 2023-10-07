import { describe, expect, it } from 'vitest'

import { extractCommandArgs } from './process_input'

describe('extractCommandArgs', () => {
    it('splits input on -c', () => {
        const [command, args] = extractCommandArgs('foo -c bar')
        expect(command).toBe('foo')
        expect(args).toBe('bar')
    })

    it('trims whitespace from split strings', () => {
        const [command, args] = extractCommandArgs('  foo   -c   bar  ')
        expect(command).toBe('foo')
        expect(args).toBe('bar')
    })

    it('returns command strings only if no -c', () => {
        const [command, args] = extractCommandArgs('foo')
        expect(command).toBe('foo')
        expect(args).toBe('')
    })

    it('returns empty strings if input undefined', () => {
        const [command, args] = extractCommandArgs(undefined)
        expect(command).toBe('')
        expect(args).toBe('')
    })

    it('returns empty strings if no input', () => {
        const [command, args] = extractCommandArgs()
        expect(command).toBe('')
        expect(args).toBe('')
    })

    it('returns input as command if no -c', () => {
        const [command, args] = extractCommandArgs('foo')
        expect(command).toBe('foo')
        expect(args).toBe('')
    })

    it('splits on first instance of -c', () => {
        const [command, args] = extractCommandArgs('foo -c bar -c baz')
        expect(command).toBe('foo -c bar')
        expect(args).toBe('baz')
    })
})
