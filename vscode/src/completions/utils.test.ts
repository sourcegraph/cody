import { describe, expect, test } from 'vitest'

import { zipGenerators } from './utils'

async function* generatorFromArray<T>(array: T[]) {
    for (const item of array) {
        yield item
    }
}

describe('zipGenerators', () => {
    test('should zip values from multiple generators', async () => {
        const gen1 = generatorFromArray([1, 2, 3])
        const gen2 = generatorFromArray([-1, -2, -3])
        const gen3 = generatorFromArray([100, 101, 102])
        const zipped = zipGenerators([gen1, gen2, gen3])

        expect(await zipped.next()).toEqual({ value: [1, -1, 100], done: false })
        expect(await zipped.next()).toEqual({ value: [2, -2, 101], done: false })
        expect(await zipped.next()).toEqual({ value: [3, -3, 102], done: false })
        expect(await zipped.next()).toEqual({ value: undefined, done: true })
    })

    test('should handle empty generators', async () => {
        const emptyGen = generatorFromArray([])
        const gen = generatorFromArray([1, 2, 3])
        const zipped = zipGenerators([emptyGen, gen])

        expect(await zipped.next()).toEqual({ value: [undefined, 1], done: false })
        expect(await zipped.next()).toEqual({ value: [undefined, 2], done: false })
        expect(await zipped.next()).toEqual({ value: [undefined, 3], done: false })
        expect(await zipped.next()).toEqual({ value: undefined, done: true })
    })

    test('should handle generators of different lengths', async () => {
        const gen1 = generatorFromArray([1, 2])
        const gen2 = generatorFromArray([-1, -2, -3])
        const zipped = zipGenerators([gen1, gen2])

        expect(await zipped.next()).toEqual({ value: [1, -1], done: false })
        expect(await zipped.next()).toEqual({ value: [2, -2], done: false })
        expect(await zipped.next()).toEqual({ value: [undefined, -3], done: false })
        expect(await zipped.next()).toEqual({ value: undefined, done: true })
    })

    test('should complete when all generators are empty', async () => {
        const gen1 = generatorFromArray([])
        const gen2 = generatorFromArray([])
        const zipped = zipGenerators([gen1, gen2])

        expect(await zipped.next()).toEqual({ value: undefined, done: true })
    })
})
