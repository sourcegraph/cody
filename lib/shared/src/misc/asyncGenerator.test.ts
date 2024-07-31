import { describe, expect, test, vi } from 'vitest'
import {
    allValuesFrom,
    asyncGeneratorFromVSCodeEvent,
    asyncGeneratorWithValues,
    combineLatest,
    firstValueFrom,
    memoizeLastValue,
    omitDuplicateSequences,
    readValuesFrom,
} from './asyncGenerator'

describe('asyncGeneratorFromVSCodeEvent', () => {
    test('should stop yielding when aborted', async () => {
        const mockEvent = vi.fn()
        const abortController = new AbortController()
        let eventCallback: (value: number) => void

        mockEvent.mockImplementation((callback: (value: number) => void) => {
            eventCallback = callback
            return { dispose: vi.fn() }
        })

        const generator = asyncGeneratorFromVSCodeEvent(mockEvent, undefined, abortController.signal)

        // Simulate event emissions
        setTimeout(() => {
            eventCallback(1)
            eventCallback(2)
            setTimeout(() => {
                eventCallback(3)
                eventCallback(4)
                abortController.abort()
                eventCallback(5) // This should not be yielded
            }, 0)
        }, 0)

        const result = []
        for await (const value of generator) {
            result.push(value)
        }

        expect(result).toEqual([1, 2, 3, 4])
    })
})

describe('firstValueFrom', () => {
    test('should abort an infinite async generator and return the first value', async () => {
        async function* infiniteGenerator(signal: AbortSignal) {
            let i = 0
            while (!signal.aborted) {
                yield i++
            }
        }

        const abortController = new AbortController()
        const result = await firstValueFrom(infiniteGenerator(abortController.signal), abortController)
        expect(result).toBe(0)
        expect(abortController.signal.aborted).toBe(true)
    })
})

describe('combineLatest', () => {
    test('combine latest values', async () => {
        const g = combineLatest([asyncGeneratorWithValues(1, 2), asyncGeneratorWithValues('a', 'b')])
        const { values, done } = readValuesFrom(g)
        await done
        expect(values).toEqual<typeof values>([
            [1, 'a'],
            [2, 'a'],
            [2, 'b'],
        ])
    })

    test('handles undefined value', async () => {
        const g = combineLatest([
            asyncGeneratorWithValues(undefined),
            asyncGeneratorWithValues(1, undefined),
        ])
        const { values, done } = readValuesFrom(g)
        await done
        expect(values).toEqual<typeof values>([
            [undefined, 1],
            [undefined, undefined],
        ])
    })

    test('handles empty input', async () => {
        const combined = combineLatest([] as any)
        const results = []

        for await (const result of combined) {
            results.push(result)
        }

        expect(results).toEqual([])
    })

    test('keeps going after one returns', { timeout: 1000 }, async () => {
        const returnsAfter1 = async function* () {
            yield 1
        }
        const returnsAfterC = async function* () {
            yield 'a'
            yield 'b'
            await new Promise(resolve => setTimeout(resolve))
            yield 'c'
        }

        const g = combineLatest([returnsAfter1(), returnsAfterC()])
        const { values, done } = readValuesFrom(g)
        await done
        expect(values).toEqual<typeof values>([
            [1, 'a'],
            [1, 'b'],
            [1, 'c'],
        ])
    })

    test('aborts', async () => {
        const abortController = new AbortController()
        const g = combineLatest([asyncGeneratorWithValues(1, 2)], abortController.signal)
        const { values, done } = readValuesFrom(g)
        abortController.abort()
        await done
        expect(values).toEqual<typeof values>([])
    })
})

describe('memoizeLatest', () => {
    test('memoize latest values', async () => {
        let calls = 0
        const factory = async function* (n: number, signal?: AbortSignal) {
            calls++
            await new Promise(resolve => setTimeout(resolve))
            yield n
            yield n + 1
        }

        const memoized = memoizeLastValue(factory, args => args[0])
        expect(calls).toBe(0)

        const signal = new AbortController().signal
        expect(await allValuesFrom(memoized(0, signal))).toEqual<number[]>([0, 1])
        expect(calls).toBe(1)

        expect(await allValuesFrom(memoized(10, signal))).toEqual<number[]>([10, 11])
        expect(calls).toBe(2)

        expect(await allValuesFrom(memoized(0, signal))).toEqual<number[]>([1, 0, 1])
        expect(calls).toBe(3)
    })
})

describe('omitDuplicateSequences', () => {
    test('should omit duplicate consecutive values', async () => {
        const input = asyncGeneratorWithValues(1, 1, 2, 2, 2, 1, 3, 4, 4, 5)
        const result = omitDuplicateSequences(input)
        const values = await allValuesFrom(result)
        expect(values).toEqual([1, 2, 1, 3, 4, 5])
    })

    test('should use custom isEqual function', async () => {
        const input = asyncGeneratorWithValues(
            { id: 1, value: 'a' },
            { id: 1, value: 'b' },
            { id: 2, value: 'c' },
            { id: 2, value: 'd' }
        )
        const isEqual = (a: { id: number }, b: { id: number }) => a.id === b.id
        const result = omitDuplicateSequences(input, isEqual)
        const values = await allValuesFrom(result)
        expect(values).toEqual([
            { id: 1, value: 'a' },
            { id: 2, value: 'c' },
        ])
    })

    test('should stop yielding when aborted', async () => {
        const input = asyncGeneratorWithValues(1, 2, 3, 4, 5)
        const abortController = new AbortController()
        const result = omitDuplicateSequences(input, undefined, abortController.signal)

        setTimeout(() => abortController.abort(), 10)

        const values = []
        for await (const value of result) {
            values.push(value)
            await new Promise(resolve => setTimeout(resolve, 5))
        }

        expect(values.length).toBeLessThan(5)
    })
})
