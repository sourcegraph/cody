import { describe, expect, it } from 'vitest'
import { testFileUri } from '../test/path-helpers'
import { PromptString, createPromptString, ps } from './prompt-string'

describe('PromptString', () => {
    it('can not be generated dynamically unless it consists of allowed sources', () => {
        expect(ps`foo`).toBeInstanceOf(PromptString)
        expect(ps`foo${ps`bar`}`).toBeInstanceOf(PromptString)

        // @ts-expect-error: Can't inline a string
        expect(() => ps`foo${'ho ho'}bar`).toThrowError()

        const evil = 'ha-ha!'
        // @ts-expect-error: Evil is a string and can not be appended like this
        expect(() => ps`foo${evil}bar`).toThrowError()

        const evil2 = {
            toString: () => 'hehe!',
        }
        // @ts-expect-error: Can't hack around the limitation
        expect(() => ps`foo${evil2}bar`).toThrowError()
    })

    it('correctly assembles', () => {
        expect(ps`one`.toString()).toBe('one')
        expect(ps`one ${ps`two`} three ${ps`four ${ps`five`} six`} seven`.toString()).toBe(
            'one two three four five six seven'
        )
    })

    it('keeps track of references', () => {
        const uri = testFileUri('/foo/bar.ts')
        const inner = createPromptString('i am from a file', [uri])
        const outer = ps`foo${ps`bar${inner}`}`

        expect(outer.getReferences()).toEqual([uri])
    })

    it('behaves like a string', () => {
        const s = ps`  foo${ps`bar`}baz  `
        expect(s.toString()).toBe('  foobarbaz  ')
        expect(s.length).toBe(13)
        expect(s.slice(1, 3).toString()).toBe(' f')
        expect(s.trim().toString()).toBe('foobarbaz')
        expect(s.trimEnd().toString()).toBe('  foobarbaz')
    })
})
