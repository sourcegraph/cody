import { cloneDeep } from 'lodash'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { type AllPossiblePaths, idGenerator, withPathsReplaced } from './util'

describe('IdGenerator', () => {
    it('Outputs lexicographically sortable ids', () => {
        const id1 = idGenerator.next()
        const id2 = idGenerator.next()
        const sorted = [id2, id1].toSorted()

        expect(sorted).toEqual([id1, id2])
    })
})

describe('AllPossiblePaths', () => {
    it('Works 🪄🤯', () => {
        type TestObject =
            | { a: { f: { h: 3 } }; d: 'hello' }
            | { a: { d: 'hello' } | [{ f: 'hello' } | { super: { g: 'apoijpoij' } }]; g: number }

        expectTypeOf<AllPossiblePaths<TestObject>>().toEqualTypeOf<
            'a' | 'd' | 'g' | 'a.d' | 'a.f' | 'a.f.h' | 'a.[].f' | 'a.[].super' | 'a.[].super.g'
        >()
    })
})

describe('withPathsReplaced', () => {
    it('Replaces paths', () => {
        const input = {
            a: 'a',
            b: 'b',
            c: {
                d: 'd',
                e: 'e',
            },
            g: {
                h: [{ a: 'a' }, { b: 'b' }],
            },
            key: {
                is: [{ unset: undefined }, null, { unset: null }, { unset: [{ unset: 1 }] }],
            },
        }

        // we clone the original input so that we can check later
        // that it wasn't modified
        const clonedInput = cloneDeep(input)
        expect(clonedInput).not.toBe(input)

        const [output] = withPathsReplaced(input, ['key.is.[].unset', 'c.d', 'g.h.[].b'], '<REDACTED>')

        // this tests that the input object was not modified
        expect(input).toEqual(clonedInput)

        expect(output).toEqual({
            a: 'a',
            b: 'b',
            c: {
                d: '<REDACTED>',
                e: 'e',
            },
            g: {
                h: [{ a: 'a' }, { b: '<REDACTED>' }],
            },
            key: {
                is: [{ unset: undefined }, null, { unset: null }, { unset: '<REDACTED>' }],
            },
        })
    })
})
