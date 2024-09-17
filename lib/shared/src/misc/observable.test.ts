import { Observable, Subject } from 'observable-fns'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
    NEVER,
    NO_INITIAL_VALUE,
    type ObservableValue,
    allValuesFrom,
    combineLatest,
    concat,
    createDisposables,
    distinctUntilChanged,
    firstValueFrom,
    fromLateSetSource,
    fromVSCodeEvent,
    memoizeLastValue,
    observableOfSequence,
    observableOfTimedSequence,
    promiseFactoryToObservable,
    readValuesFrom,
    shareReplay,
    startWith,
    storeLastValue,
    take,
    withLatestFrom,
} from './observable'

describe('firstValueFrom', () => {
    test('gets first value', async () => {
        const observable = observableOfSequence(1, 2)
        expect(await firstValueFrom(observable)).toBe(1)
    })
})

describe('allValuesFrom', () => {
    test('gets first value', async () => {
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
        const observable = combineLatest([
            observableOfSequence('A', 'B'),
            observableOfSequence('x', 'y'),
        ])
        expect(await allValuesFrom(observable)).toEqual<ObservableValue<typeof observable>[]>([
            ['B', 'x'],
            ['B', 'y'],
        ])
    })

    test('combines latest values (async)', async () => {
        const observable = combineLatest([
            observableOfTimedSequence(0, 'A', 0, 'B'),
            observableOfTimedSequence(0, 'x', 0, 'y'),
        ])
        expect(await allValuesFrom(observable)).toEqual<ObservableValue<typeof observable>[]>([
            ['A', 'x'],
            ['B', 'x'],
            ['B', 'y'],
        ])
    })

    test('handles undefined value', async () => {
        const observable = combineLatest([
            observableOfSequence(undefined),
            observableOfSequence(1, undefined),
        ])
        expect(await allValuesFrom(observable)).toEqual<ObservableValue<typeof observable>[]>([
            [undefined, 1],
            [undefined, undefined],
        ])
    })

    test('handles empty input', async () => {
        expect(await allValuesFrom(combineLatest([] as any))).toEqual([])
    })

    test('keeps going after one completes', async () => {
        const completesAfterC = observableOfTimedSequence(0, 'A', 0, 'B', 0, 'C')
        const completesAfterX = observableOfTimedSequence(0, 'X')
        const observable = combineLatest([completesAfterC, completesAfterX])
        expect(await allValuesFrom(observable)).toEqual<ObservableValue<typeof observable>[]>([
            ['A', 'X'],
            ['B', 'X'],
            ['C', 'X'],
        ])
    })

    test('propagates unsubscription', async () => {
        vi.useFakeTimers()
        const observable = combineLatest([observableOfTimedSequence(10, 'A', 10, 'B')])
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
    afterEach(() => {
        vi.useRealTimers()
    })

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
})

describe('shareReplay', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    test('late subscriber gets previous value', { timeout: 500 }, async () => {
        vi.useFakeTimers()
        let called = 0
        const observable = new Observable(observer => {
            called++
            ;(async () => {
                await new Promise(resolve => setTimeout(resolve, 10))
                observer.next('a')
                await new Promise(resolve => setTimeout(resolve, 10))
                observer.next('b')
                observer.complete()
            })()
        }).pipe(shareReplay())

        const reader1 = readValuesFrom(observable)
        await vi.advanceTimersByTimeAsync(10)
        const reader2 = readValuesFrom(observable)
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

    test('creates', async () => {
        const create = vi.fn()
        const values = await allValuesFrom(
            observableOfSequence('a', 'b').pipe(createDisposables(create), take(2))
        )
        expect(create).toHaveBeenCalledTimes(2)
        expect(values).toStrictEqual<typeof values>(['a', 'b'])
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
        expect(done).rejects.toThrow('foo')
        expect(values).toStrictEqual<typeof values>([])
    })

    test('disposes previous disposable when new value arrives', async () => {
        vi.useFakeTimers()

        const disposableA: VSCodeDisposable = { dispose: vi.fn() }
        const disposableB: VSCodeDisposable = { dispose: vi.fn() }
        const { values, done, unsubscribe } = readValuesFrom(
            observableOfTimedSequence(10, 'a', 10, 'b', 10).pipe(
                createDisposables((value: string): VSCodeDisposable | undefined => {
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

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>(['a', 'b'])
        expect(disposableA.dispose).toHaveBeenCalledTimes(1)
        expect(disposableB.dispose).toHaveBeenCalledTimes(0)

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>(['a', 'b'])
        expect(disposableA.dispose).toHaveBeenCalledTimes(1)
        expect(disposableB.dispose).toHaveBeenCalledTimes(0)

        unsubscribe()
        await done
        expect(disposableB.dispose).toHaveBeenCalledTimes(1)
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

        const { values, done } = readValuesFrom(source.pipe(withLatestFrom(other)))

        await vi.advanceTimersByTimeAsync(29)
        expect(values).toStrictEqual<typeof values>([])

        await vi.advanceTimersByTimeAsync(1)
        expect(values).toStrictEqual<typeof values>([['b', 'x']])
        values.length = 0

        await vi.advanceTimersByTimeAsync(30)
        expect(values).toStrictEqual<typeof values>([['c', 'y']])
        values.length = 0

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
