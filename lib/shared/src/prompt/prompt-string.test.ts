import { describe, expect, it } from 'vitest'
import { testFileUri } from '../test/path-helpers'
import { PromptString, ps, temporary_createPromptString } from './prompt-string'

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
        const inner = temporary_createPromptString('i am from a file', [uri])
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

    it('can join', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')
        const uri3 = testFileUri('/foo/bar2.ts')

        const joined = PromptString.join(
            [
                temporary_createPromptString('foo', [uri1]),
                ps`bar`,
                temporary_createPromptString('baz', [uri2]),
            ],
            temporary_createPromptString(' ', [uri3])
        )

        expect(joined.toString()).toBe('foo bar baz')
        expect(joined.getReferences()).toEqual([uri3, uri1, uri2])
    })

    it('can replaceAll', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')

        const template = temporary_createPromptString('foo REPLACE bar REPLACE baz', [uri1])

        const replaced = template.replaceAll('REPLACE', temporary_createPromptString('🇦🇹', [uri2]))

        expect(replaced.toString()).toBe('foo 🇦🇹 bar 🇦🇹 baz')
        expect(replaced.getReferences()).toEqual([uri1, uri2])
    })

    it('can concat', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')
        const uri3 = testFileUri('/foo/bar2.ts')

        const first = temporary_createPromptString('foo', [uri1])
        const second = temporary_createPromptString('bar', [uri2])
        const third = temporary_createPromptString('baz', [uri3])

        const concatenated = first.concat(second, third)

        expect(concatenated.toString()).toBe('foobarbaz')
        expect(concatenated.getReferences()).toEqual([uri1, uri2, uri3])
    })

    it('detects invalid PromptStrings passed to utility types', () => {
        const realPromptString = ps`foo`
        const fakePromptString = 'foo' as any as PromptString

        expect(() => ps`${fakePromptString}`).toThrowError()
        expect(() => PromptString.join([fakePromptString], realPromptString)).toThrowError()
        expect(() => realPromptString.replaceAll('', fakePromptString)).toThrowError()
        expect(() => realPromptString.concat(fakePromptString)).toThrowError()
    })

    it('can not mutate the references list', () => {
        const uri = testFileUri('/foo/bar.ts')
        const ps = temporary_createPromptString('foo', [uri])

        const arr: any = ps.getReferences()
        expect(() => {
            // biome-ignore lint/performance/noDelete: 🏴‍☠️
            delete arr[0]
        }).toThrow()
    })
})
