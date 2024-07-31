import { isAbortError } from '../sourcegraph-api/errors'

/**
 * Create an async generator that yields the provided values.
 */
export async function* asyncGeneratorWithValues<T>(...yields: T[]): AsyncGenerator<T> {
    for (const value of yields) {
        yield value
    }
}

/**
 * Create an async generator that yields no values.
 */
export async function* emptyAsyncGenerator<T>(): AsyncGenerator<never> {}

/**
 * Create an async generator that yields the result of the provided promise.
 */
export async function* asyncGeneratorFromPromise<T>(promise: Promise<T>): AsyncGenerator<T> {
    yield await promise
}

/**
 * Create an async generator that yields the result of the provided async function.
 */
export async function* asyncGeneratorFromAsyncFunction<T>(fn: () => Promise<T>): AsyncGenerator<T> {
    yield await fn()
}

interface Disposable {
    dispose(): void
}

type VSCodeEvent<T> = (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => Disposable

export async function* asyncGeneratorFromVSCodeEvent<T>(
    event: VSCodeEvent<T>,
    initialValue?: T,
    signal?: AbortSignal
): AsyncGenerator<T> {
    const queue: (T | typeof ABORTED)[] = []
    let resolveNext: (() => void) | null = null

    if (initialValue !== undefined) {
        queue.push(initialValue)
    }

    const disposable = event(e => {
        queue.push(e)
        if (resolveNext) {
            resolveNext()
            resolveNext = null
        }
    })

    signal?.addEventListener('abort', () => {
        queue.push(ABORTED)
    })

    try {
        while (true) {
            if (signal?.aborted) {
                break
            }

            if (queue.length === 0) {
                await new Promise<void>(resolve => {
                    resolveNext = resolve
                    if (signal) {
                        const handler = () => {
                            resolveNext = null
                            resolve()
                            signal.removeEventListener('abort', handler)
                        }
                        signal.addEventListener('abort', handler)
                    }
                })
            }

            while (queue.length > 0) {
                const value = queue.shift()
                if (value === ABORTED) {
                    return
                }
                yield value as T
            }
        }
    } catch (error) {
        if (signal?.aborted && isAbortError(error)) {
            return
        }
        throw error
    } finally {
        disposable.dispose()
    }
}

/** Sentinel value. */
const ABORTED = Object.freeze({ aborted: true })

export async function firstValueFrom<T>(
    asyncGenerator: AsyncGenerator<T>,
    abortController: Pick<AbortController, 'abort'>
): Promise<T> {
    for await (const value of asyncGenerator) {
        // Must call abort to prevent almost-certain memory leak if the async generator is still
        // running.
        abortController.abort()
        return value
    }
    throw new Error('no value from async generator')
}

export async function allValuesFrom<T>(asyncGenerator: AsyncGenerator<T>): Promise<T[]> {
    const values: T[] = []
    for await (const value of asyncGenerator) {
        values.push(value)
    }
    return values
}

export function readValuesFrom<T>(asyncGenerator: AsyncGenerator<T>): {
    values: T[]
    done: Promise<void>
} {
    const values: T[] = []
    const done = new Promise<void>((resolve, reject) => {
        ;(async () => {
            try {
                for await (const value of asyncGenerator) {
                    values.push(value)
                }
                resolve()
            } catch (error) {
                reject(error)
            }
        })()
    })
    return { values, done }
}

export function combineLatest<T>(
    asyncGenerators: [AsyncGenerator<T>],
    signal?: AbortSignal
): AsyncGenerator<T>
export function combineLatest<T1, T2>(
    asyncGenerators: [AsyncGenerator<T1>, AsyncGenerator<T2>],
    signal?: AbortSignal
): AsyncGenerator<[T1, T2]>
export function combineLatest<T1, T2, T3>(
    asyncGenerators: [AsyncGenerator<T1>, AsyncGenerator<T2>, AsyncGenerator<T3>],
    signal?: AbortSignal
): AsyncGenerator<[T1, T2, T3]>
export function combineLatest<T1, T2, T3, T4>(
    asyncGenerators: [AsyncGenerator<T1>, AsyncGenerator<T2>, AsyncGenerator<T3>, AsyncGenerator<T4>],
    signal?: AbortSignal
): AsyncGenerator<[T1, T2, T3, T4]>
export async function* combineLatest<T>(
    asyncGenerators: AsyncGenerator<T>[],
    signal?: AbortSignal
): AsyncGenerator<T, void> {
    if (asyncGenerators.length === 0) {
        return
    }

    const latestValues: ({ value: T } | undefined)[] = new Array(asyncGenerators.length).fill(undefined)
    const done: boolean[] = new Array(asyncGenerators.length).fill(false)
    type Result = { result: IteratorResult<T, T>; index: number }
    const nextPromises: (Promise<Result> | null)[] = asyncGenerators.map((iterator, index) =>
        iterator.next().then(result => ({ result, index }))
    )

    try {
        while (!signal?.aborted) {
            const { result, index } = await Promise.race([
                Promise.race(nextPromises.filter((p): p is Promise<Result> => p !== null)),
                new Promise<never>((_, reject) => {
                    signal?.addEventListener('abort', () => reject(ABORTED))
                }),
            ])

            if (result.done) {
                done[index] = true
            } else {
                latestValues[index] = { value: result.value }

                if (latestValues.every(value => value !== undefined)) {
                    yield [...latestValues.map(e => e!.value)] as T
                }
            }

            if (done.every(done => done)) {
                return
            }

            nextPromises[index] = result.done
                ? null
                : asyncGenerators[index].next().then(result => ({ result, index }))
        }
    } catch (error) {
        if (error === ABORTED) {
            return
        }
        throw error
    }
}

/**
 * Return an async generator that yields the latest value from the given async generator.
 */
export function memoizeLastValue<P extends unknown[], T>(
    factory: (...args: [...P, signal: AbortSignal]) => AsyncGenerator<T>,
    keyFn: (args: P) => string | number
): (...args: [...P, signal: AbortSignal]) => AsyncGenerator<T> {
    const memo = new Map<string | number, T | undefined>()

    return async function* (...args: [...P, signal: AbortSignal]): AsyncGenerator<T> {
        const key = keyFn(args.slice(0, -1) as P)
        const signal = args[args.length - 1] as AbortSignal

        // Yield last value immediately if it exists.
        if (memo.has(key)) {
            yield memo.get(key)!
        }

        const generator = factory(...args)

        for await (const value of generator) {
            memo.set(key, value)
            yield value

            if (signal?.aborted) {
                return
            }
        }
    }
}

/**
 * Return an async generator that yields each value from the given async generator, but only when it
 * is different from the prior value.
 */
export async function* omitDuplicateSequences<T>(
    asyncGenerator: AsyncGenerator<T>,
    isEqual: (a: T, b: T) => boolean = (a, b) => a === b,
    signal?: AbortSignal
): AsyncGenerator<T> {
    let lastValue: T | undefined = undefined
    let isFirstValue = true

    for await (const value of asyncGenerator) {
        if (signal?.aborted) {
            return
        }

        if (isFirstValue || !isEqual(value, lastValue!)) {
            yield value
            lastValue = value
            isFirstValue = false
        }
    }
}
