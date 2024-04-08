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
        const inner = createPromptString('i am from a file', new Set([uri]))
        const outer = ps`foo${ps`bar${inner}`}`

        expect(outer.getReferences()).toEqual(new Set([uri]))
    })

    it('behaves like a string', () => {
        const s = ps`  foo${ps`bar`}baz  `
        expect(s.toString()).toBe('  foobarbaz  ')
        expect(s.length).toBe(13)
        expect(s.slice(1, 3).toString()).toBe(' f')
        expect(s.trim().toString()).toBe('foobarbaz')
        expect(s.trimEnd().toString()).toBe('  foobarbaz')
    })

    it('can join', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')
        const uri3 = testFileUri('/foo/bar2.ts')

        const joined = PromptString.join(
            [
                createPromptString('foo', new Set([uri1])),
                ps`bar`,
                createPromptString('baz', new Set([uri2])),
            ],
            createPromptString(' ', new Set([uri3]))
        )

        expect(joined.toString()).toBe('foo bar baz')
        expect(joined.getReferences()).toEqual(new Set([uri1, uri2, uri3]))
    })
})
