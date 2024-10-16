import { describe, expect, test } from 'vitest'
import { Mutable } from './mutable'
import { allValuesFrom } from './observable'

describe('Mutable', () => {
    test('can mutate state without mutating underlying', async () => {
        const quinn = { name: 'quinn', age: 20 }
        const slack = { name: 'slack', age: 25 }
        const originalState = [quinn, slack]
        const state = new Mutable<Array<{ name: string; age: number }>>(originalState)

        const observedChanges = allValuesFrom(state.changes)

        state.mutate(draft => {
            // You can mutate the state as if you had a mutable reference
            draft[1].name = 'beyang'
            return draft
        })

        state.complete()
        const [original, next, ...other] = await observedChanges
        expect(other).toEqual([])
        expect(original).toBe(originalState)
        expect(next).not.toBe(originalState)
        expect(next[0]).toBe(quinn)
        expect(next[1]).toEqual({ name: 'beyang', age: 25 })
    })
})
