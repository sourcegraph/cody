import { describe, expect, it } from 'vitest'

import { generatorWithTimeout, zipGenerators } from './utils'

async function* generatorFromArray<T>(array: T[]) {
    for (const item of array) {
        yield await Promise.resolve(item)
    }
}

describe('zipGenerators', () => {
    it('should zip values from multiple generators', async () => {
        const gen1 = generatorFromArray([1, 2, 3])
        const gen2 = generatorFromArray([-1, -2, -3])
        const gen3 = generatorFromArray([100, 101, 102])
        const zipped = zipGenerators([gen1, gen2, gen3])

        expect(await zipped.next()).toEqual({ value: [1, -1, 100], done: false })
        expect(await zipped.next()).toEqual({ value: [2, -2, 101], done: false })
        expect(await zipped.next()).toEqual({ value: [3, -3, 102], done: false })
        expect(await zipped.next()).toEqual({ value: undefined, done: true })
    })

    it('should handle empty generators', async () => {
        const emptyGen = generatorFromArray([])
        const gen = generatorFromArray([1, 2, 3])
        const zipped = zipGenerators([emptyGen, gen])

        expect(await zipped.next()).toEqual({ value: [undefined, 1], done: false })
        expect(await zipped.next()).toEqual({ value: [undefined, 2], done: false })
        expect(await zipped.next()).toEqual({ value: [undefined, 3], done: false })
        expect(await zipped.next()).toEqual({ value: undefined, done: true })
    })

    it('should handle generators of different lengths', async () => {
        const gen1 = generatorFromArray([1, 2])
        const gen2 = generatorFromArray([-1, -2, -3])
        const zipped = zipGenerators([gen1, gen2])

        expect(await zipped.next()).toEqual({ value: [1, -1], done: false })
        expect(await zipped.next()).toEqual({ value: [2, -2], done: false })
        expect(await zipped.next()).toEqual({ value: [undefined, -3], done: false })
        expect(await zipped.next()).toEqual({ value: undefined, done: true })
    })

    it('should complete when all generators are empty', async () => {
        const gen1 = generatorFromArray([])
        const gen2 = generatorFromArray([])
        const zipped = zipGenerators([gen1, gen2])

        expect(await zipped.next()).toEqual({ value: undefined, done: true })
    })
})

describe('generatorWithTimeout', () => {
    it('finishes the internal generator if a consumer stops early', async () => {
        let isFinished = false
        const gen = (async function* () {
            try {
                yield 1
                yield 2
                yield 3
            } finally {
                isFinished = true
            }
        })()

        const timeout = 1000
        const controller = new AbortController()
        const timeoutGenerator = generatorWithTimeout(gen, timeout, controller)

        const result = []
        for await (const value of timeoutGenerator) {
            if (result.length === 2) {
                break // Stop after consuming two values
            }
            result.push(value)
        }

        expect(result).to.deep.equal([1, 2])
        expect(isFinished).to.be.true
    })
})
