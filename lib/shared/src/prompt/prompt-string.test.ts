import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import { testFileUri } from '../test/path-helpers'
import { PromptString, ps } from './prompt-string'

function createFakeDocument(uri: vscode.Uri, text: string): vscode.TextDocument {
    return {
        uri,
        getText() {
            return text
        },
    } as any
}

describe('PromptString', () => {
    it('can not be generated dynamically unless it consists of allowed sources', () => {
        expect(ps`foo`).toBeInstanceOf(PromptString)
        expect(ps`foo${ps`bar`}`).toBeInstanceOf(PromptString)
        expect(ps`foo${1234}`).toBeInstanceOf(PromptString)

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

        class FakePromptString extends PromptString {
            toString() {
                return '😈'
            }
        }
        const fake = new FakePromptString('')
        expect(() => ps`${fake}`).toThrowError()
    })

    it('correctly assembles', () => {
        expect(ps`one`.toString()).toBe('one')
        expect(ps`one ${ps`two`} three ${ps`four ${ps`five`} six`} seven ${8}`.toString()).toBe(
            'one two three four five six seven 8'
        )
    })

    it('keeps track of references', () => {
        const uri = testFileUri('/foo/bar.ts')
        const document = createFakeDocument(uri, 'i am from a file')
        const inner = PromptString.fromDocumentText(document)
        const outer = ps`foo${ps`bar${inner}`}`

        expect(outer.getReferences()).toEqual([uri])
    })

    it('implements toFilteredString()', async () => {
        const uri = testFileUri('/foo/bar.ts')
        const document = createFakeDocument(uri, 'i am from a file')
        const promptString = PromptString.fromDocumentText(document)

        const allowPolicy = {
            isUriIgnored: () => Promise.resolve(false as const),
            toDebugObject: () => ({ lastContextFiltersResponse: null }),
        }
        const denyPolicy = {
            isUriIgnored: () => Promise.resolve('repo:foo' as const),
            toDebugObject: () => ({ lastContextFiltersResponse: null }),
        }

        expect(await promptString.toFilteredString(allowPolicy)).toEqual('i am from a file')
        expect(async () => await promptString.toFilteredString(denyPolicy)).rejects.toThrowError(
            'The prompt contains a reference to a file that is not allowed by your current Cody policy.'
        )
    })

    it('behaves like a string', () => {
        const s = ps`  Foo${ps`bar`}baz  `
        expect(s.toString()).toBe('  Foobarbaz  ')
        expect(s.length).toBe(13)
        expect(s.slice(1, 3).toString()).toBe(' F')
        expect(s.trim().toString()).toBe('Foobarbaz')
        expect(s.trimEnd().toString()).toBe('  Foobarbaz')
        expect(s.indexOf('Foo')).toBe(2)
        expect(s.indexOf(ps`Foo`)).toBe(2)
        expect(s.toLocaleLowerCase().toString()).toBe('  foobarbaz  ')
        expect(s.includes('Foo')).toBe(true)
    })

    it('can split', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')

        const one = createFakeDocument(uri1, 'foo\n')
        const two = createFakeDocument(uri2, 'bar\n')
        const split = ps`${PromptString.fromDocumentText(one)}${PromptString.fromDocumentText(
            two
        )}baz`.split('\n')

        expect(split).toHaveLength(3)
        expect(split[0]).toBeInstanceOf(PromptString)
        expect(split[0].toString()).toBe('foo')
        expect(split[0].getReferences()).toEqual([uri1, uri2])
        expect(split[1]).toBeInstanceOf(PromptString)
        expect(split[1].toString()).toBe('bar')
        expect(split[1].getReferences()).toEqual([uri1, uri2])
        expect(split[2]).toBeInstanceOf(PromptString)
        expect(split[2].toString()).toBe('baz')
        expect(split[2].getReferences()).toEqual([uri1, uri2])
    })

    it('can join', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')
        const uri3 = testFileUri('/foo/bar2.ts')
        const doc1 = createFakeDocument(uri1, 'foo')
        const doc2 = createFakeDocument(uri2, 'baz')
        const doc3 = createFakeDocument(uri3, ' ')

        const joined = PromptString.join(
            [PromptString.fromDocumentText(doc1), ps`bar`, PromptString.fromDocumentText(doc2)],
            PromptString.fromDocumentText(doc3)
        )

        expect(joined.toString()).toBe('foo bar baz')
        expect(joined.getReferences()).toEqual([uri3, uri1, uri2])
    })

    it('can replace', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')

        const doc1 = createFakeDocument(uri1, 'foo bar foo')
        const doc2 = createFakeDocument(uri2, '🇦🇹')

        const template = PromptString.fromDocumentText(doc1)

        const replaced = template.replace(/foo$/, PromptString.fromDocumentText(doc2))

        expect(replaced.toString()).toBe('foo bar 🇦🇹')
        expect(replaced.getReferences()).toEqual([uri1, uri2])
    })

    it('can replaceAll', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')

        const doc1 = createFakeDocument(uri1, 'foo REPLACE bar REPLACE baz')
        const doc2 = createFakeDocument(uri2, '🇦🇹')

        const template = PromptString.fromDocumentText(doc1)

        const replaced = template.replaceAll('REPLACE', PromptString.fromDocumentText(doc2))

        expect(replaced.toString()).toBe('foo 🇦🇹 bar 🇦🇹 baz')
        expect(replaced.getReferences()).toEqual([uri1, uri2])
    })

    it('can concat', () => {
        const uri1 = testFileUri('/foo/bar.ts')
        const uri2 = testFileUri('/foo/bar1.ts')
        const uri3 = testFileUri('/foo/bar2.ts')

        const doc1 = createFakeDocument(uri1, 'foo')
        const doc2 = createFakeDocument(uri2, 'bar')
        const doc3 = createFakeDocument(uri3, 'baz')

        const first = PromptString.fromDocumentText(doc1)
        const second = PromptString.fromDocumentText(doc2)
        const third = PromptString.fromDocumentText(doc3)

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
        const doc = createFakeDocument(uri, 'foo')
        const ps = PromptString.fromDocumentText(doc)

        const arr: any = ps.getReferences()
        // biome-ignore lint/performance/noDelete: 🏴‍☠️
        delete arr[0]

        expect(ps.getReferences()).toEqual([uri])
    })
})
