import { Observable, multicast } from 'observable-fns'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
    type ObservableValue,
    allValuesFrom,
    combineLatest,
    createSyncObservable,
    distinctUntilChanged,
    firstValueFrom,
    fromVSCodeEvent,
    mapSyncObservable,
    memoizeLastValue,
    multicastSync,
    observableOfSequence,
    observableOfTimedSequence,
    pipeSyncObservable,
    promiseFactoryToObservable,
    readValuesFrom,
    shareReplay,
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

describe('createSyncObservable', { timeout: 500 }, () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    test('creates a SyncObservable with initial value and subscriber', async () => {
        vi.useFakeTimers()
        const syncObservable = createSyncObservable(3, Observable.of(4))
        expect(syncObservable.value).toBe(3)

        const { values, done, unsubscribe } = readValuesFrom(syncObservable)
        await vi.runAllTimersAsync()
        unsubscribe()
        await done

        expect(syncObservable.value).toBe(4)
        expect(values).toEqual([3, 4])
    })

    test('supports multiple subscribers', async () => {
        vi.useFakeTimers()
        const syncObservable = createSyncObservable(
            'X',
            observableOfTimedSequence('A', 10, 'B', 10, 'C')
        )
        const reader1 = readValuesFrom(syncObservable)
        const reader2 = readValuesFrom(syncObservable)
        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        expect(syncObservable.value).toBe('C')
        expect.soft(reader1.values).toEqual(['X', 'A', 'B', 'C'])
        expect.soft(reader2.values).toEqual(['X', 'A', 'B', 'C'])
    })

    test('supports distinctUntilChanged with multiple subscribers', async () => {
        vi.useFakeTimers()
        const syncObservable = pipeSyncObservable(
            createSyncObservable('x', observableOfSequence('a', 'b', 'b', 'c')),
            distinctUntilChanged()
        )

        const reader1 = readValuesFrom(syncObservable)
        const reader2 = readValuesFrom(syncObservable)

        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        expect(syncObservable.value).toBe('c')
        const WANT: typeof reader1.values = ['x', 'a', 'b', 'c']
        expect.soft(reader1.values).toEqual(WANT)
        expect.soft(reader2.values).toEqual(WANT)
    })

    test('supports complex pipes', async () => {
        vi.useFakeTimers()
        const syncObservable = mapSyncObservable(
            createSyncObservable('x', observableOfTimedSequence('a', 10, 'b', 10, 'c', 10, 'c')),
            s => s.toUpperCase()
        )

        const reader1 = readValuesFrom(pipeSyncObservable(syncObservable, distinctUntilChanged()))
        const reader2 = readValuesFrom(
            pipeSyncObservable(
                mapSyncObservable(syncObservable, value => value.toLowerCase()),
                distinctUntilChanged()
            )
        )

        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        expect(syncObservable.value).toBe('C')
        expect.soft(reader1.values).toEqual(['X', 'A', 'B', 'C'])
        expect.soft(reader2.values).toEqual(['x', 'a', 'b', 'c'])
    })
})

describe('multicastSync', { timeout: 500 }, () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    test('non-multicast', async () => {
        vi.useFakeTimers()
        let called = 0
        const observable = new Observable(observer => {
            called++
            observer.next('a')
            observer.next('b')
            observer.complete()
        })
        const reader1 = readValuesFrom(observable)
        const reader2 = readValuesFrom(observable)
        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        const WANT: typeof reader1.values = ['a', 'b']
        expect.soft(reader1.values).toEqual(WANT)
        expect.soft(reader2.values).toEqual(WANT)
        expect(called).toBe(2)

        expect(await allValuesFrom(observable)).toEqual(WANT)
        expect(called).toBe(3)
    })

    test('multicast normal Observable', async () => {
        vi.useFakeTimers()
        let called = 0
        const observable = multicast(
            new Observable(observer => {
                called++
                observer.next('a')
                observer.next('b')
                observer.complete()
            })
        )
        const reader1 = readValuesFrom(observable)
        const reader2 = readValuesFrom(observable)
        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        const WANT: typeof reader1.values = ['a', 'b']
        expect.soft(reader1.values).toEqual(WANT)
        expect.soft(reader2.values).toEqual(WANT)
        expect(called).toBe(1)

        expect(await allValuesFrom(observable)).toEqual(WANT)
        expect(called).toBe(2)
    })

    test('multicast normal Observable with late subscriber', async () => {
        vi.useFakeTimers()
        let called = 0
        const observable = multicast(
            new Observable(observer => {
                called++
                ;(async () => {
                    await new Promise(resolve => setTimeout(resolve, 10))
                    observer.next('a')
                    await new Promise(resolve => setTimeout(resolve, 10))
                    observer.next('b')
                    observer.complete()
                })()
            })
        )
        const reader1 = readValuesFrom(observable)
        await vi.advanceTimersByTimeAsync(10)
        const reader2 = readValuesFrom(observable)
        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        expect.soft(reader1.values).toEqual(['a', 'b'])
        expect.soft(reader2.values).toEqual(['b']) // reader2 missed out on the 1st value
        expect(called).toBe(1)
    })

    test('multicast', async () => {
        vi.useFakeTimers()
        let called = 0
        const observable = multicastSync(
            createSyncObservable(
                'x',
                new Observable(observer => {
                    called++
                    observer.next('a')
                    observer.next('b')
                    observer.complete()
                })
            )
        )
        const reader1 = readValuesFrom(observable)
        const reader2 = readValuesFrom(observable)
        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        const WANT: typeof reader1.values = ['x', 'a', 'b']
        expect(observable.value).toBe('b')
        expect.soft(reader1.values).toEqual(WANT)
        expect.soft(reader2.values).toEqual(WANT)
        expect(called).toBe(1)
    })

    test('multicast with late subscriber', async () => {
        vi.useFakeTimers()
        let called = 0
        const observable = multicastSync(
            createSyncObservable(
                'x',
                new Observable(observer => {
                    called++
                    ;(async () => {
                        await new Promise(resolve => setTimeout(resolve, 10))
                        observer.next('a')
                        await new Promise(resolve => setTimeout(resolve, 10))
                        observer.next('b')
                        observer.complete()
                    })()
                })
            )
        )
        const reader1 = readValuesFrom(observable)
        await vi.advanceTimersByTimeAsync(10)
        const reader2 = readValuesFrom(observable)
        await vi.runAllTimersAsync()
        reader1.unsubscribe()
        reader2.unsubscribe()
        await reader1.done
        await reader2.done

        expect(observable.value).toBe('b')
        expect.soft(reader1.values).toEqual(['x', 'a', 'b'])
        expect.soft(reader2.values).toEqual(['b']) // reader2 missed out on the 1st and 2nd values
        expect(called).toBe(1)
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
