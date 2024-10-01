import { Observable, Subject } from 'observable-fns'
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import {
    NEVER,
    NO_INITIAL_VALUE,
    type ObservableValue,
    abortableOperation,
    allValuesFrom,
    combineLatest,
    concat,
    createDisposables,
    distinctUntilChanged,
    firstValueFrom,
    fromLateSetSource,
    fromVSCodeEvent,
    lifecycle,
    memoizeLastValue,
    observableOfSequence,
    observableOfTimedSequence,
    promiseFactoryToObservable,
    readValuesFrom,
    shareReplay,
    startWith,
    storeLastValue,
    switchMap,
    withLatestFrom,
} from './observable'
import { pendingOperation } from './observableOperation'

// This is a leak detector to ensure that there are 0 net subscriptions (i.e., leaked subscriptions
// that have not been unsubscribed) after all the tests finish. It should be safe to run with
// `DETECT_LEAKS = true` at all times during testing.
const DETECT_LEAKS = true
const LEAK_STATS: {
    subscribes: number
    subscribesInTests: string[]
    unsubscribes: number
    unsubscribesInTests: string[]
} = {
    subscribes: 0,
    subscribesInTests: [],
    unsubscribes: 0,
    unsubscribesInTests: [],
}
if (DETECT_LEAKS) {
    function currentTestName(): string {
        const testName = expect.getState().currentTestName?.trim()
        if (!testName) {
            throw new Error('No current test name')
        }
        return testName
    }

    const observableMod = await import('observable-fns')
    const origSubscribe = observableMod.Observable.prototype.subscribe
    observableMod.Observable.prototype.subscribe = function <T>(
        this: Observable<T>,
        ...args: Parameters<typeof this.subscribe>
    ) {
        // Hook into subscriptions.
        LEAK_STATS.subscribes++
        LEAK_STATS.subscribesInTests.push(currentTestName())

        const subscription = origSubscribe.apply(this, args)

        // Hook into unsubscriptions. This is more reliable than hooking
        // `Subscription.prototype.unsubscribe` because sometimes just this field is set.
        let _stateValue: string = subscription._state
        Object.defineProperty(subscription, '_state', {
            get() {
                return _stateValue
            },
            set(value) {
                if (value === 'closed') {
                    LEAK_STATS.unsubscribes++
                    LEAK_STATS.unsubscribesInTests.push(currentTestName())
                }
                _stateValue = value
            },
        })

        return subscription
    } as any

    afterAll(() => {
        if (LEAK_STATS.subscribes !== LEAK_STATS.unsubscribes) {
            const leaksPerTest = new Map<string, number>()
            for (const testName of LEAK_STATS.subscribesInTests) {
                leaksPerTest.set(testName, (leaksPerTest.get(testName) ?? 0) + 1)
            }
            for (const testName of LEAK_STATS.unsubscribesInTests) {
                const netSubscriptions = (leaksPerTest.get(testName) ?? 0) - 1
                if (netSubscriptions === 0) {
                    leaksPerTest.delete(testName)
                } else {
                    leaksPerTest.set(testName, netSubscriptions)
                }
            }

            expect.fail(
                [
                    `Observable subscription leak detected: ${LEAK_STATS.subscribes} subscribes, ${LEAK_STATS.unsubscribes} unsubscribes`,
                    `Tests with leaks:\n\n${[...leaksPerTest.entries()]
                        .map(([testName, netSubscriptions]) => `- ${testName}: ${netSubscriptions}`)
                        .join('\n')}`,
                ].join('\n\n')
            )
        }
    })
}
function expectNetSubscriptions(n: number): void {
    if (DETECT_LEAKS) {
        const netSubscriptions = LEAK_STATS.subscribes - LEAK_STATS.unsubscribes
        expect(`${netSubscriptions} active subscriptions`).toBe(`${n} active subscriptions`)
    }
}

describe('firstValueFrom', () => {
    test('gets first value', async () => {
        const observable = observableOfTimedSequence(1, 'a', 2)
        expect(await firstValueFrom(observable)).toBe('a')
    })

    test('aborts with AbortSignal', async () => {
        vi.useFakeTimers()
        const observable = new Observable<number>(observer => {
            const timeout = setTimeout(() => {
                observer.next(1)
                observer.complete()
            }, 1000)
            return () => clearTimeout(timeout)
        })
        const controller = new AbortController()
        const promise = firstValueFrom(observable, controller.signal)
        controller.abort()
        await expect(promise).rejects.toThrow('Aborted')
    })
})

describe('allValuesFrom', () => {
    test('gets all values', async () => {
        const observable = observableOfSequence(1, 2)
        expect(await allValuesFrom(observable)).toStrictEqual([1, 2])
    })
})

describe('promiseFactoryToObservable', () => {
    test('emits resolved value and completes', async () => {
        const observable = promiseFactoryToObservable(() => Promise.resolve('test value'))
        expect(await allValuesFrom(observable)).toEqual(['test value'])
    })

    test('emits error when promise rejects', async () => {
        const observable = promiseFactoryToObservable(() => Promise.reject(new Error('test error')))
        await expect(allValuesFrom(observable)).rejects.toThrow('test error')
    })

    test('emits error when promise throws', async () => {
        const observable = promiseFactoryToObservable(() => {
            throw new Error('test error')
        })
        await expect(allValuesFrom(observable)).rejects.toThrow('test error')
    })

    test('completes without emitting when aborted', async () => {
        vi.useFakeTimers()
        const observable = promiseFactoryToObservable(
            () =>
                new Promise<string>(resolve => {
                    setTimeout(() => resolve('test value'), 1000)
                })
        )
        const { values, done, unsubscribe } = readValuesFrom(observable)
        unsubscribe()
        await done
        expect(values).toEqual([])
        vi.useRealTimers()
    })
})

describe('abortableOperation', () => {
    test('emits resolved value and completes', async () => {
        const source = observableOfTimedSequence('a', 1, 'b', 1, 'c')
        const operation = vi.fn((input: string, signal: AbortSignal) => Promise.resolve(input))
        const observable = source.pipe(abortableOperation(operation))
        expect(await allValuesFrom(observable)).toEqual(['a', 'b', 'c'])
        expect(operation).toHaveBeenCalledTimes(3)
    })

    test('emits error when operation rejects', async () => {
        vi.useFakeTimers()
        const source = observableOfTimedSequence('a', 10)
        const operation = vi.fn(() => Promise.reject(new Error('test error')))
        const observable = source.pipe(abortableOperation(operation))
        await expect(allValuesFrom(observable)).rejects.toThrow('test error')
    })

    test('emits error when operation throws', async () => {
        const source = observableOfTimedSequence('a', 10)
        const operation = vi.fn(() => {
            throw new Error('test error')
        })
        const observable = source.pipe(abortableOperation(operation))
        await expect(allValuesFrom(observable)).rejects.toThrow('test error')
    })

    test('aborts operation when unsubscribed', async () => {
        vi.useFakeTimers()
        const source = observableOfSequence(1)
        const operation = vi.fn(
            (input: number, signal: AbortSignal) =>
                new Promise<number>(resolve => {
                    const timeout = setTimeout(() => resolve(input * 2), 1000)
                    signal.addEventListener('abort', () => clearTimeout(timeout))
                })
        )
        const observable = source.pipe(abortableOperation(operation))
        const { values, done, unsubscribe } = readValuesFrom(observable)

        await vi.advanceTimersByTimeAsync(500)
        unsubscribe()
        await done

        expect(values).toEqual([])
        expect(operation).toHaveBeenCalledTimes(1)
    })

    test('handles multiple inputs', async () => {
        vi.useFakeTimers()
        const source = observableOfTimedSequence(10, 'a', 20, 'b', 30, 'c')
        const operation = vi.fn(
            (input: string, signal: AbortSignal) =>
                new Promise<string>(resolve => setTimeout(() => resolve(`${input}${input}`), 15))
        )
        const observable = source.pipe(abortableOperation(operation))

        const { values, done } = readValuesFrom(observable)
        await vi.runAllTimersAsync()
        await done

        expect(values).toStrictEqual<typeof values>(['aa', 'bb', 'cc'])
        expect(operation).toHaveBeenCalledTimes(3)
    })
})

describe('fromLateSetSource', () => {
    test('emits values after source is set', async () => {
        const { observable, setSource } = fromLateSetSource<number>()
        const { values, done } = readValuesFrom(observable)

        setSource(observableOfSequence(1, 2, 3))

        await done
        expect(values).toEqual([1, 2, 3])
    })

    test('handles multiple observers', async () => {
        const { observable, setSource } = fromLateSetSource<string>()
        const observer1 = readValuesFrom(observable)
        const observer2 = readValuesFrom(observable)

        setSource(observableOfSequence('a', 'b', 'c'))

        await observer1.done
        await observer2.done
        expect(observer1.values).toEqual(['a', 'b', 'c'])
        expect(observer2.values).toEqual(['a', 'b', 'c'])
    })

    test('throws error when trying to set source multiple times', () => {
        const { setSource } = fromLateSetSource<number>()
        setSource(observableOfSequence(1, 2, 3))
        expect(() => setSource(observableOfSequence(4, 5, 6))).toThrow('source is already set')
    })

    test('subsequent setSource calls', { timeout: 500 }, async () => {
        vi.useFakeTimers()
        const { observable, setSource } = fromLateSetSource<string>()

        setSource(observableOfTimedSequence(10, 'a', 10, 'b'))
        const reader1 = readValuesFrom(observable)
        await vi.advanceTimersByTimeAsync(10)
        expect(reader1.values).toStrictEqual<typeof reader1.values>(['a'])

        setSource(observableOfTimedSequence(5, 'x', 20, 'y'), false)
        const reader2 = readValuesFrom(observable)
        await vi.advanceTimersByTimeAsync(10)
        expect(reader1.values).toStrictEqual<typeof reader1.values>(['a', 'x'])
        expect(reader2.values).toStrictEqual<typeof reader2.values>(['x'])

        await vi.advanceTimersByTimeAsync(20)
        expect(reader1.values).toStrictEqual<typeof reader1.values>(['a', 'x', 'y'])
        expect(reader2.values).toStrictEqual<typeof reader2.values>(['x', 'y'])

        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done
    })

    test('unsubscribes correctly', async () => {
        const { observable, setSource } = fromLateSetSource<number>()
        const { values, done, unsubscribe } = readValuesFrom(observable)

        unsubscribe()
        setSource(observableOfSequence(1, 2, 3))

        await done
        expect(values).toEqual([])
    })

    test('works with shareReplay', { timeout: 500 }, async () => {
        const { observable, setSource } = fromLateSetSource<number>()
        setSource(NEVER)
        const derived = observable.pipe(shareReplay())
        const subscription = derived.subscribe({})
        setSource(observableOfSequence(1, 2, 3), false)
        expect(await firstValueFrom(derived)).toBe(1)
        subscription.unsubscribe()
    })
})

describe('combineLatest', { timeout: 500 }, () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    test('combines latest values (sync)', async () => {
        const observable = combineLatest(observableOfSequence('A', 'B'), observableOfSequence('x', 'y'))
        expect(await allValuesFrom(observable)).toEqual<ObservableValue<typeof observable>[]>([
            ['B', 'y'],
        ])
    })

    test('combines latest values (async)', async () => {
        const observable = combineLatest(
            observableOfTimedSequence(0, 'A', 0, 'B'),
            observableOfTimedSequence(0, 'x', 0, 'y')
        )
        expect(await allValuesFrom(observable)).toEqual<ObservableValue<typeof observable>[]>([
            ['A', 'x'],
            ['B', 'x'],
            ['B', 'y'],
        ])
    })

    test('handles undefined value', async () => {
        const observable = combineLatest(
            observableOfSequence(undefined),
            observableOfSequence(1, undefined)
        )
        expect(await allValuesFrom(observable)).toEqual<ObservableValue<typeof observable>[]>([
            [undefined, undefined],
        ])
    })

    test('handles empty input', async () => {
        expect(await allValuesFrom(combineLatest())).toEqual([])
    })

    test('keeps going after one completes', async () => {
        vi.useFakeTimers()
        const unsubscribed = { c: false, x: false }
        const completesAfterC = observableOfTimedSequence(0, 'A', 10, 'B', 10, 'C').pipe(
            lifecycle({
                onUnsubscribe: () => {
                    unsubscribed.c = true
                },
            })
        )
        const completesAfterX = observableOfTimedSequence(0, 'X').pipe(
            lifecycle({
                onUnsubscribe: () => {
                    unsubscribed.x = true
                },
            })
        )

        const { values, clearValues, done, status } = readValuesFrom(
            combineLatest(completesAfterC, completesAfterX)
        )
        expect(values).toStrictEqual<typeof values>([])

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>([
            ['A', 'X'],
            ['B', 'X'],
        ])
        expect(unsubscribed).toStrictEqual<typeof unsubscribed>({ c: false, x: true })
        clearValues()

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>([['C', 'X']])
        expect(unsubscribed).toStrictEqual<typeof unsubscribed>({ c: true, x: true })

        expect(status()).toBe('complete')
        await done
    })

    test('immediately emits any input error and unsubscribes all', async () => {
        vi.useFakeTimers()

        const unsubscribed = { a: false, b: false, c: false }
        const inputA = observableOfTimedSequence(0, 'A', 100).pipe(
            lifecycle({
                onUnsubscribe: () => {
                    unsubscribed.a = true
                },
            })
        )
        const inputB = new Observable<string>(observer => {
            observer.next('B')
            setTimeout(() => observer.error(new Error('my-error')), 20)
            return () => {
                unsubscribed.b = true
            }
        })
        const inputC = observableOfTimedSequence(10, 'C', 100).pipe(
            lifecycle({
                onUnsubscribe: () => {
                    unsubscribed.c = true
                },
            })
        )

        const { values, clearValues, done, status } = readValuesFrom(
            combineLatest(inputA, inputB, inputC)
        )
        done.catch(() => {})
        expect(values).toStrictEqual<typeof values>([])

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>([['A', 'B', 'C']])
        expect(unsubscribed).toStrictEqual<typeof unsubscribed>({ a: false, b: false, c: false })
        clearValues()

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>([])
        clearValues()
        expect(status()).toBe('error')
        expect(unsubscribed).toStrictEqual<typeof unsubscribed>({ a: true, b: true, c: true })
        await expect(done).rejects.toThrow('my-error')
    })

    test('propagates unsubscription', async () => {
        vi.useFakeTimers()
        const observable = combineLatest(observableOfTimedSequence(10, 'A', 10, 'B'))
        const { values, done, unsubscribe } = readValuesFrom(observable)
        await vi.advanceTimersByTimeAsync(10)
        unsubscribe()
        await done
        expect(values).toEqual<typeof values>([['A']])
    })
})

describe('memoizeLastValue', () => {
    test('memoizes and emits the latest value', async () => {
        let subscriptions = 0
        const factory = vi.fn(
            (x: number) =>
                new Observable<string>(observer => {
                    subscriptions++
                    observer.next(`Value ${x}, subscription ${subscriptions}`)
                    observer.complete()
                })
        )

        const memoized = memoizeLastValue(factory, args => args[0])

        const result1 = await firstValueFrom(memoized(1))
        expect(result1).toBe('Value 1, subscription 1')
        expect(factory).toHaveBeenCalledTimes(1)

        const result2 = await allValuesFrom(memoized(1))
        expect(result2).toStrictEqual(['Value 1, subscription 1', 'Value 1, subscription 2'])
        expect(factory).toHaveBeenCalledTimes(2)

        const result3 = await firstValueFrom(memoized(2))
        expect(result3).toBe('Value 2, subscription 3')
        expect(factory).toHaveBeenCalledTimes(3)
    })
})

describe('fromVSCodeEvent', { timeout: 500 }, () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    class SimpleEventEmitter<T> {
        private listeners: ((value: T) => void)[] = []

        event = (listener: (value: T) => void) => {
            this.listeners.push(listener)
            return {
                dispose: () => {
                    const index = this.listeners.indexOf(listener)
                    if (index > -1) {
                        this.listeners.splice(index, 1)
                    }
                },
            }
        }

        fire(value: T) {
            for (const listener of this.listeners) {
                listener(value)
            }
        }

        dispose() {
            this.listeners = []
        }
    }

    test('emits values from VS Code event', async () => {
        const eventEmitter = new SimpleEventEmitter<string>()
        const observable = fromVSCodeEvent(eventEmitter.event)

        const { values, done, unsubscribe } = readValuesFrom(observable)

        vi.useFakeTimers()
        eventEmitter.fire('first')
        eventEmitter.fire('second')
        eventEmitter.fire('third')
        eventEmitter.dispose()
        unsubscribe()
        await done

        expect(values).toEqual(['first', 'second', 'third'])
    })

    test('emits initial value if provided', async () => {
        const eventEmitter = new SimpleEventEmitter<string>()
        const observable = fromVSCodeEvent(eventEmitter.event, () => 'initial')

        vi.useFakeTimers()
        const { values, done, unsubscribe } = readValuesFrom(observable)

        eventEmitter.fire('next')
        await vi.runAllTimersAsync()
        eventEmitter.dispose()
        unsubscribe()
        await done

        expect(values).toEqual(['initial', 'next'])
    })

    test('unsubscribes correctly', async () => {
        const eventEmitter = new SimpleEventEmitter<string>()
        const observable = fromVSCodeEvent(eventEmitter.event)

        const { values, done, unsubscribe } = readValuesFrom(observable)

        eventEmitter.fire('first')
        unsubscribe()
        eventEmitter.fire('second')
        await done

        expect(values).toEqual(['first'])
    })

    test('does not emit initial value if NO_INITIAL_VALUE is returned', async () => {
        const eventEmitter = new SimpleEventEmitter<string>()
        const observable = fromVSCodeEvent(eventEmitter.event, () => NO_INITIAL_VALUE)

        const { values, done, unsubscribe } = readValuesFrom(observable)

        vi.useFakeTimers()
        eventEmitter.fire('first')
        await vi.runAllTimersAsync()
        eventEmitter.dispose()
        unsubscribe()
        await done

        expect(values).toEqual(['first'])
    })
})

describe('distinctUntilChanged', () => {
    test('supports multiple subscribers', async () => {
        vi.useFakeTimers()
        const observable = observableOfSequence('a', 'b', 'b', 'c').pipe(distinctUntilChanged())
        const reader1 = readValuesFrom(observable)
        const reader2 = readValuesFrom(observable)

        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        const WANT: typeof reader1.values = ['a', 'b', 'c']
        expect.soft(reader1.values).toEqual(WANT)
        expect.soft(reader2.values).toEqual(WANT)
    })

    test('handles Symbol values', async () => {
        vi.useFakeTimers()

        const uniqueSymbolA = Symbol('a')
        const uniqueSymbolB = [Symbol('b'), Symbol('b'), Symbol('b')]
        const observable = observableOfSequence<string | symbol>(
            Symbol.for('a'),
            Symbol.for('a'),
            uniqueSymbolA,
            Symbol.for('a'),
            'a',
            'b',
            uniqueSymbolB[0],
            uniqueSymbolB[1],
            Symbol.for('b'),
            uniqueSymbolB[2],
            'b',
            'b',
            pendingOperation,
            pendingOperation,
            pendingOperation.toString(),
            pendingOperation
        ).pipe(distinctUntilChanged())
        expect(await allValuesFrom(observable)).toStrictEqual<(string | symbol)[]>([
            Symbol.for('a'),
            uniqueSymbolA,
            Symbol.for('a'),
            'a',
            'b',
            uniqueSymbolB[0],
            uniqueSymbolB[1],
            Symbol.for('b'),
            uniqueSymbolB[2],
            'b',
            pendingOperation,
            pendingOperation.toString(),
            pendingOperation,
        ])
    })
})

describe('shareReplay', () => {
    test('late subscriber gets previous value', { timeout: 500 }, async ({ onTestFinished }) => {
        vi.useFakeTimers()
        let called = 0
        const observable = new Observable(observer => {
            called++
            ;(async () => {
                await new Promise(resolve => setTimeout(resolve, 10))
                observer.next('a')
                await new Promise(resolve => setTimeout(resolve, 10))
                observer.next('b')
            })()
        }).pipe(shareReplay())

        const reader1 = readValuesFrom(observable)
        onTestFinished(async () => {
            reader1.unsubscribe()
            await reader1.done
        })
        await vi.advanceTimersByTimeAsync(10)
        const reader2 = readValuesFrom(observable)
        onTestFinished(async () => {
            reader2.unsubscribe()
            await reader2.done
        })
        expectNetSubscriptions(5)
        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        const WANT: typeof reader1.values = ['a', 'b']
        expect.soft(reader1.values).toEqual(WANT)
        expect.soft(reader2.values).toEqual(WANT) // reader2 got the previous value
        expect(called).toBe(1) // but the observable was only heated up once
    })
})

describe('createDisposables', () => {
    interface VSCodeDisposable {
        dispose(): void
    }

    test('creates', async ({ onTestFinished }) => {
        vi.useFakeTimers()
        const create = vi.fn()
        const { values, unsubscribe, done } = readValuesFrom(
            observableOfTimedSequence('a', 'b', 10).pipe(createDisposables(create))
        )
        onTestFinished(async () => {
            unsubscribe()
            await done
            expectNetSubscriptions(0)
        })
        await vi.advanceTimersByTimeAsync(0)
        expect(create).toHaveBeenCalledTimes(2)
        expect(values).toStrictEqual<typeof values>(['a', 'b'])
        expectNetSubscriptions(2)
    })

    test('handles errors in create', async () => {
        vi.useFakeTimers()
        const create = vi.fn().mockImplementation(() => {
            throw new Error('foo')
        })
        const { values, done } = readValuesFrom(
            observableOfSequence('a', 'b').pipe(createDisposables(create))
        )
        done.catch(() => {})
        await vi.runOnlyPendingTimersAsync()
        expect(create).toHaveBeenCalledTimes(1)
        await expect(done).rejects.toThrow('foo')
        expect(values).toStrictEqual<typeof values>([])
    })

    test('disposes previous disposable when new value arrives', async () => {
        vi.useFakeTimers()

        const record = vi.fn<(value: string) => void>()
        const disposableA: VSCodeDisposable = { dispose: vi.fn(() => record('dispose(a)')) }
        const disposableB: VSCodeDisposable = { dispose: vi.fn(() => record('dispose(b)')) }
        const { values, done, unsubscribe } = readValuesFrom(
            observableOfTimedSequence(10, 'a', 10, 'b', 10).pipe(
                createDisposables((value: string): VSCodeDisposable | undefined => {
                    record(`create(${value})`)
                    if (value === 'a') {
                        return disposableA
                    }
                    if (value === 'b') {
                        return disposableB
                    }
                    return undefined
                })
            )
        )

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>(['a'])
        expect(disposableA.dispose).not.toHaveBeenCalled()
        expect(disposableB.dispose).not.toHaveBeenCalled()
        expect(record.mock.calls).toEqual([['create(a)']])
        record.mockClear()

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>(['a', 'b'])
        expect(disposableA.dispose).toHaveBeenCalledTimes(1)
        expect(disposableB.dispose).toHaveBeenCalledTimes(0)
        expect(record.mock.calls).toEqual([['dispose(a)'], ['create(b)']])
        record.mockClear()

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>(['a', 'b'])
        expect(disposableA.dispose).toHaveBeenCalledTimes(1)
        expect(disposableB.dispose).toHaveBeenCalledTimes(0)
        expect(record.mock.calls).toEqual([])
        record.mockClear()

        unsubscribe()
        await done
        expect(disposableB.dispose).toHaveBeenCalledTimes(1)
        expect(record.mock.calls).toEqual([['dispose(b)']])
    })

    test('disposes upon unsubscription but not completion', async () => {
        vi.useFakeTimers()

        const disposable: VSCodeDisposable = { dispose: vi.fn() }
        const create = vi.fn().mockReturnValue(disposable)

        const { values, done, unsubscribe, status } = readValuesFrom(
            observableOfTimedSequence(10, 'a', 10).pipe(createDisposables(create))
        )

        await vi.advanceTimersByTimeAsync(10)
        expect(create).toHaveBeenCalledTimes(1)
        expect(disposable.dispose).toHaveBeenCalledTimes(0)
        expect(status()).toBe<ReturnType<typeof status>>('pending')
        expect(values).toStrictEqual<typeof values>(['a'])

        await vi.advanceTimersByTimeAsync(10)
        expect(create).toHaveBeenCalledTimes(1)
        expect(disposable.dispose).toHaveBeenCalledTimes(0)
        expect(status()).toBe<ReturnType<typeof status>>('pending')
        expect(values).toStrictEqual<typeof values>(['a'])

        unsubscribe()
        await done
        expect(disposable.dispose).toHaveBeenCalledTimes(1)
        expect(status()).toBe<ReturnType<typeof status>>('unsubscribed')
    })

    test('works with switchMap to unsubscribe before creating the next inner observable', async () => {
        vi.useFakeTimers()

        const record = vi.fn<(value: string) => void>()
        const disposableA: VSCodeDisposable = { dispose: vi.fn(() => record('dispose(a)')) }
        const disposableB: VSCodeDisposable = { dispose: vi.fn(() => record('dispose(b)')) }
        const { done, unsubscribe } = readValuesFrom(
            observableOfTimedSequence('a', 10, 'b').pipe(
                switchMap(value =>
                    Observable.of(value).pipe(
                        createDisposables((value: string): VSCodeDisposable | undefined => {
                            record(`create(${value})`)
                            if (value === 'a') {
                                return disposableA
                            }
                            if (value === 'b') {
                                return disposableB
                            }
                            return undefined
                        })
                    )
                )
            )
        )

        await vi.runAllTimersAsync()
        unsubscribe()
        await done
        expect(record.mock.calls).toEqual([['create(a)'], ['dispose(a)'], ['create(b)'], ['dispose(b)']])
    })
})

describe('switchMap', () => {
    test('switches to new inner observable when source emits', async () => {
        vi.useFakeTimers()
        const source = new Subject<string>()
        const result = source.pipe(switchMap(c => observableOfTimedSequence(10, `${c}-1`, 10, `${c}-2`)))
        const { values, clearValues, done } = readValuesFrom(result)

        source.next('a')
        await vi.advanceTimersByTimeAsync(15)
        expect(values).toEqual<typeof values>(['a-1'])
        clearValues()

        source.next('b')
        await vi.advanceTimersByTimeAsync(15)
        expect(values).toEqual<typeof values>(['b-1'])
        clearValues()

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toEqual<typeof values>(['b-2'])
        clearValues()

        source.complete()
        await done
        expect(values).toEqual<typeof values>([])
    })

    test('unsubscribes from previous inner observable', async () => {
        vi.useFakeTimers()
        const innerSubject1 = new Subject<string>()
        const innerSubject2 = new Subject<string>()
        const source = new Subject<number>()
        const result = source.pipe(switchMap(x => (x === 1 ? innerSubject1 : innerSubject2)))
        const { values, done } = readValuesFrom(result)

        source.next(1)
        innerSubject1.next('a')
        expect(values).toEqual(['a'])

        source.next(2)
        innerSubject1.next('b') // This should be ignored
        innerSubject2.next('c')
        expect(values).toEqual(['a', 'c'])

        source.complete()
        innerSubject2.complete()
        await done
        expect(values).toEqual(['a', 'c'])
    })

    test('handles errors from source observable', async () => {
        vi.useFakeTimers()
        const source = new Subject<number>()
        const result = source.pipe(switchMap(x => observableOfSequence(x * 10)))
        const { values, done } = readValuesFrom(result)

        source.next(1)
        await vi.advanceTimersByTimeAsync(10)
        source.next(2)
        await vi.advanceTimersByTimeAsync(10)
        source.error(new Error('Source error'))

        await expect(done).rejects.toThrow('Source error')
        expect(values).toEqual([10, 20])
    })

    test('handles errors from inner observable', async () => {
        vi.useFakeTimers()
        const source = new Subject<number>()
        const result = source.pipe(
            switchMap(x => {
                if (x === 2) {
                    return new Observable(observer => observer.error(new Error('Inner error')))
                }
                return observableOfSequence(x * 10)
            })
        )
        const { values, done } = readValuesFrom(result)
        done.catch(() => {})

        source.next(1)
        await vi.advanceTimersByTimeAsync(10)
        source.next(2)
        await vi.advanceTimersByTimeAsync(10)

        await expect(done).rejects.toThrow('Inner error')
        expect(values).toEqual([10])
    })

    test('completes when source completes and last inner observable completes', async () => {
        vi.useFakeTimers()
        const source = new Subject<string>()
        const result = source.pipe(switchMap(c => observableOfTimedSequence(10, `${c}-1`, 10, `${c}-2`)))
        const { values, done } = readValuesFrom(result)

        source.next('a')
        await vi.advanceTimersByTimeAsync(20)
        source.complete()

        await done
        expect(values).toEqual(['a-1', 'a-2'])
    })
})

describe('storeLastValue', () => {
    test('stores the last value emitted by an observable', () => {
        const subject = new Subject<number>()
        const { value, subscription } = storeLastValue(subject)

        expect(value.isSet).toBe(false)
        expect(value.last).toBeUndefined()

        subject.next(1)
        expect(value.isSet).toBe(true)
        expect(value.last).toBe(1)

        subject.next(2)
        expect(value.isSet).toBe(true)
        expect(value.last).toBe(2)

        subscription.unsubscribe()

        subject.next(3)
        expect(value.isSet).toBe(true)
        expect(value.last).toBe(2)
    })

    test('handles empty observable', () => {
        const subject = new Subject<number>()
        const { value, subscription } = storeLastValue(subject)

        expect(value.isSet).toBe(false)
        expect(value.last).toBeUndefined()

        subscription.unsubscribe()
    })

    test('handles observable that completes', () => {
        const subject = new Subject<string>()
        const { value, subscription } = storeLastValue(subject)

        subject.next('a')
        subject.next('b')
        subject.complete()

        expect(value.isSet).toBe(true)
        expect(value.last).toBe('b')

        subscription.unsubscribe()
    })
})

describe('concat', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    test('concatenates observables in order', async () => {
        const observable = concat(
            observableOfSequence(1, 2),
            observableOfSequence(3, 4),
            observableOfSequence(5, 6)
        )
        expect(await allValuesFrom(observable)).toStrictEqual<number[]>([1, 2, 3, 4, 5, 6])
    })

    test('handles empty observables', async () => {
        const observable = concat(
            observableOfSequence(),
            observableOfSequence(1, 2),
            observableOfSequence(),
            observableOfSequence(3, 4)
        )
        expect(await allValuesFrom(observable)).toStrictEqual<number[]>([1, 2, 3, 4])
    })

    test('propagates errors', async () => {
        const error = new Error('Test error')
        const observable = concat(
            observableOfSequence(1, 2),
            new Observable(observer => observer.error(error)),
            observableOfSequence(3, 4)
        )
        await expect(allValuesFrom(observable)).rejects.toThrow('Test error')
    })

    test('unsubscribes correctly', async () => {
        vi.useFakeTimers()
        const observable = concat(
            observableOfTimedSequence(10, 'a', 10, 'b'),
            observableOfTimedSequence(10, 'c', 10, 'd')
        )
        const { values, done, unsubscribe } = readValuesFrom(observable)

        await vi.advanceTimersByTimeAsync(15)
        unsubscribe()
        await done

        expect(values).toStrictEqual<typeof values>(['a'])
    })
})

describe('withLatestFrom', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    test('combines latest values from two observables', async () => {
        vi.useFakeTimers()
        const source = observableOfTimedSequence(10, 'a', 20, 'b', 30, 'c')
        const other = observableOfTimedSequence(15, 'x', 25, 'y')

        const { values, clearValues, done } = readValuesFrom(source.pipe(withLatestFrom(other)))

        await vi.advanceTimersByTimeAsync(29)
        expect(values).toStrictEqual<typeof values>([])

        await vi.advanceTimersByTimeAsync(1)
        expect(values).toStrictEqual<typeof values>([['b', 'x']])
        clearValues()

        await vi.advanceTimersByTimeAsync(30)
        expect(values).toStrictEqual<typeof values>([['c', 'y']])
        clearValues()

        await vi.runAllTimersAsync()
        await done
        expect(values).toStrictEqual<typeof values>([])
    })

    test('does not emit until other observable emits', async () => {
        vi.useFakeTimers()
        const source = observableOfTimedSequence(10, 'a', 20, 'b')
        const other = observableOfTimedSequence(25, 'x')

        const { values, done } = readValuesFrom(source.pipe(withLatestFrom(other)))
        await vi.runAllTimersAsync()
        await done

        expect(values).toStrictEqual<typeof values>([['b', 'x']])
    })

    test('propagates errors from source observable', async () => {
        const source = new Observable<string>(observer => {
            observer.next('a')
            observer.error(new Error('Source error'))
        })
        const other = observableOfSequence(1)
        await expect(allValuesFrom(source.pipe(withLatestFrom(other)))).rejects.toThrow('Source error')
    })

    test('propagates errors from other observable', async () => {
        const source = observableOfSequence('a', 'b')
        const other = new Observable<number>(observer => {
            observer.next(1)
            observer.error(new Error('Other error'))
        })
        await expect(allValuesFrom(source.pipe(withLatestFrom(other)))).rejects.toThrow('Other error')
    })

    test('unsubscribes correctly', async () => {
        vi.useFakeTimers()
        const source = observableOfTimedSequence(10, 'a', 20, 'b', 30, 'c')
        const other = observableOfTimedSequence(15, 'x', 25, 'y')

        const { values, done, unsubscribe } = readValuesFrom(source.pipe(withLatestFrom(other)))
        await vi.advanceTimersByTimeAsync(35)
        unsubscribe()
        await done

        expect(values).toStrictEqual<typeof values>([['b', 'x']])
    })

    test('works with startWith', async () => {
        vi.useFakeTimers()
        const source = new Subject<string>()
        const other = NEVER.pipe(startWith('x'))

        const { values, unsubscribe, done } = readValuesFrom(source.pipe(withLatestFrom(other)))
        expect(values).toStrictEqual<typeof values>([])

        source.next('a')
        await vi.runOnlyPendingTimersAsync()
        expect(values).toStrictEqual<typeof values>([['a', 'x']])

        unsubscribe()
        await done
    })
})
