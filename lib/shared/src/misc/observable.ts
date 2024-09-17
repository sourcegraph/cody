import { diffJson } from 'diff'
import isEqual from 'lodash/isEqual'
import {
    Observable,
    type ObservableLike,
    Subject,
    type Subscription,
    type SubscriptionObserver,
    map,
    unsubscribe,
} from 'observable-fns'
import { AsyncSerialScheduler } from 'observable-fns/dist/_scheduler'

/**
 * A type helper to get the value type of an {@link Observable} (i.e., what it emits from `next`).
 */
export type ObservableValue<O> = O extends Observable<infer V> ? V : never

export interface Unsubscribable {
    unsubscribe(): void
}

/**
 * Make a VS Code Disposable from an {@link Unsubscribable}.
 */
export function subscriptionDisposable(sub: Unsubscribable): { dispose(): void } {
    return { dispose: sub.unsubscribe.bind(sub) }
}

/**
 * @internal For testing only.
 */
export function observableOfSequence<T>(...values: T[]): Observable<T> {
    return new Observable<T>(observer => {
        for (const value of values) {
            observer.next(value)
        }
        observer.complete()
    })
}

/**
 * @internal For testing only.
 */
export function observableOfTimedSequence<T>(...values: (T | number)[]): Observable<T> {
    return new Observable<T>(observer => {
        let unsubscribed = false
        ;(async () => {
            for (const value of values) {
                if (unsubscribed) {
                    break
                }
                if (typeof value === 'number') {
                    await new Promise(resolve => setTimeout(resolve, value))
                } else {
                    observer.next(value)
                }
            }
            observer.complete()
        })()
        return () => {
            unsubscribed = true
        }
    })
}

/**
 * Return the first value emitted by an {@link Observable}, or throw an error if the observable
 * completes without emitting a value.
 */
export async function firstValueFrom<T>(observable: Observable<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const subscription = observable.subscribe({
            next: value => {
                subscription.unsubscribe()
                resolve(value)
            },
            error: reject,
            complete: () => {
                reject('Observable completed without emitting a value')
            },
        })
    })
}

/**
 * Converts the observable factory to an async function that returns the first value emitted by the
 * created observable.
 */
export function toFirstValueGetter<T, U extends unknown[]>(fn: (...args: U) => Observable<T>) {
    return (...args: U): Promise<T> => firstValueFrom(fn(...args))
}

export async function waitUntilComplete(observable: Observable<unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        observable.subscribe({
            error: reject,
            complete: () => resolve(),
        })
    })
}

/**
 * Return all values emitted by an {@link Observable}.
 */
export async function allValuesFrom<T>(observable: Observable<T>): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
        const values: T[] = []
        observable.subscribe({
            next: value => values.push(value),
            error: reject,
            complete: () => resolve(values),
        })
    })
}

/** ESNext will have Promise.withResolvers built in. */
function promiseWithResolvers<T>(): {
    promise: Promise<T>
    resolve: (value: T) => void
    reject: (error: any) => void
} {
    let resolve: (value: T) => void = () => {}
    let reject: (error: any) => void = () => {}
    const promise = new Promise<T>((_resolve, _reject) => {
        resolve = _resolve
        reject = _reject
    })
    return { promise, resolve, reject }
}

/**
 * @internal For testing only.
 */
export function readValuesFrom<T>(observable: Observable<T>): {
    values: T[]
    done: Promise<void>
    unsubscribe(): void
    status: () => 'pending' | 'complete' | 'error' | 'unsubscribed'
} {
    const values: T[] = []
    const { promise, resolve, reject } = promiseWithResolvers<void>()
    let status: ReturnType<ReturnType<typeof readValuesFrom<T>>['status']> = 'pending'
    const subscription = observable.subscribe({
        next: value => values.push(value),
        error: err => {
            reject(err)
            status = 'error'
        },
        complete: () => {
            resolve()
            status = 'complete'
        },
    })
    const result: ReturnType<typeof readValuesFrom<T>> = {
        values,
        done: promise,
        unsubscribe: () => {
            subscription.unsubscribe()
            resolve()
            status = 'unsubscribed'
        },
        status: () => status,
    }
    return result
}

/**
 * Prefer using {@link promiseFactoryToObservable} instead because it supports aborting long-running
 * operations.
 *
 * @internal For testing only.
 */
export function promiseToObservable<T>(promise: Promise<T>): Observable<T> {
    return new Observable<T>(observer => {
        promise
            .then(value => {
                observer.next(value)
                observer.complete()
            })
            .catch(error => {
                observer.error(error)
            })
    })
}

/**
 * Create an {@link Observable} that emits the result of a promise (which created by the abortable
 * {@link factory} function).
 */
export function promiseFactoryToObservable<T>(
    factory: (signal: AbortSignal) => Promise<T>
): Observable<T> {
    return new Observable<T>(observer => {
        let unsubscribed = false
        const abortController = new AbortController()
        const signal = abortController.signal

        const run = async () => {
            try {
                signal?.throwIfAborted()
                const value = await factory(signal)
                signal?.throwIfAborted()
                if (!unsubscribed) {
                    observer.next(value)
                    observer.complete()
                }
            } catch (error) {
                if (!unsubscribed) {
                    if (signal.aborted) {
                        observer.complete()
                    } else {
                        observer.error(error)
                    }
                }
            }
        }
        run()

        return () => {
            unsubscribed = true
            abortController.abort()
        }
    })
}

/**
 * Create an {@link Observable} that initially does not emit, but after {@link setSource} is called
 * with a source, all subscribers subscribe to that source observable.
 */
export function fromLateSetSource<T>(): {
    observable: Observable<T>
    setSource: (input: Observable<T>, throwErrorIfAlreadySet?: boolean) => void
} {
    let source: Observable<T> | null = null
    const observers: {
        observer: SubscriptionObserver<T>
        subscription: Unsubscribable | null
    }[] = []

    const observable = new Observable<T>(observer => {
        const subscription = source ? source.subscribe(observer) : null
        const entry: (typeof observers)[number] = { observer, subscription }
        observers.push(entry)
        return () => {
            entry.subscription?.unsubscribe()
            const index = observers.indexOf(entry)
            if (index !== -1) {
                observers.splice(index, 1)
            }
        }
    })

    const setSource = (input: Observable<T>, throwErrorIfAlreadySet = true) => {
        if (source && throwErrorIfAlreadySet) {
            throw new Error('source is already set')
        }
        source = input
        for (const entry of observers) {
            entry.subscription?.unsubscribe()
            entry.subscription = source.subscribe(entry.observer)
        }
    }

    return { observable, setSource }
}
/**
 * An empty {@link Observable}, which emits no values and completes immediately.
 */
export const EMPTY = new Observable<never>(observer => {
    observer.complete()
})

/**
 * An observable that never emits, errors, nor completes.
 */
export const NEVER: Observable<never> = new Observable<never>(() => {})

/**
 * Combine the latest values from multiple {@link Observable}s into a single {@link Observable} that
 * emits only after all input observables have emitted once.
 */
export function combineLatest<T1>(observables: [Observable<T1>]): Observable<[T1]>
export function combineLatest<T1, T2>(
    observables: [Observable<T1>, Observable<T2>]
): Observable<[T1, T2]>
export function combineLatest<T1, T2, T3>(
    observables: [Observable<T1>, Observable<T2>, Observable<T3>]
): Observable<[T1, T2, T3]>
export function combineLatest<T1, T2, T3, T4>(
    observables: [Observable<T1>, Observable<T2>, Observable<T3>, Observable<T4>]
): Observable<[T1, T2, T3, T4]>
export function combineLatest<T>(observables: Array<Observable<T>>): Observable<T[]>
export function combineLatest<T>(observables: Array<Observable<T>>): Observable<T[]> {
    if (observables.length === 0) {
        return EMPTY
    }
    return new Observable<T[]>(observer => {
        const latestValues: T[] = new Array(observables.length)
        const hasValue: boolean[] = new Array(observables.length).fill(false)
        let completed = 0
        const subscriptions: Subscription<T>[] = []

        for (let index = 0; index < observables.length; index++) {
            const observable = observables[index]
            subscriptions.push(
                observable.subscribe({
                    next(value: T) {
                        latestValues[index] = value
                        hasValue[index] = true
                        if (hasValue.every(Boolean)) {
                            observer.next([...latestValues])
                        }
                    },
                    error(err: any) {
                        observer.error(err)
                    },
                    complete() {
                        completed++
                        if (completed === observables.length) {
                            observer.complete()
                        }
                    },
                })
            )
        }

        return () => {
            for (const subscription of subscriptions) {
                subscription.unsubscribe()
            }
        }
    })
}

/**
 * Return an Observable that emits the latest value from the given Observable.
 */
export function memoizeLastValue<P extends unknown[], T>(
    factory: (...args: P) => Observable<T>,
    keyFn: (args: P) => string | number
): (...args: P) => Observable<T> {
    const memo = new Map<string | number, T | undefined>()

    return (...args: P): Observable<T> => {
        const key = keyFn(args)

        return new Observable<T>(observer => {
            // Emit last value immediately if it exists.
            if (memo.has(key)) {
                observer.next(memo.get(key)!)
            }

            const subscription = factory(...args).subscribe({
                next: value => {
                    memo.set(key, value)
                    observer.next(value)
                },
                error: error => observer.error(error),
                complete: () => observer.complete(),
            })

            return () => {
                subscription.unsubscribe()
            }
        })
    }
}

interface VSCodeDisposable {
    dispose(): void
}

type VSCodeEvent<T> = (
    listener: (e: T) => any,
    thisArgs?: any,
    disposables?: VSCodeDisposable[]
) => VSCodeDisposable

export const NO_INITIAL_VALUE = Symbol('noInitialValue')

/**
 * Create an Observable from a VS Code event. If {@link getInitial} is provided, the Observable will
 * emit the initial value upon subscription (unless it's {@link NO_INITIAL_VALUE}).
 */
export function fromVSCodeEvent<T>(
    event: VSCodeEvent<T>,
    getInitialValue?: () => T | typeof NO_INITIAL_VALUE | Promise<T | typeof NO_INITIAL_VALUE>
): Observable<T> {
    return new Observable(observer => {
        if (getInitialValue) {
            const initialValue = getInitialValue()
            if (initialValue instanceof Promise) {
                initialValue.then(value => {
                    if (value !== NO_INITIAL_VALUE) {
                        observer.next(value)
                    }
                })
            } else {
                if (initialValue !== NO_INITIAL_VALUE) {
                    observer.next(initialValue)
                }
            }
        }

        let disposed = false
        const eventDisposable = event(value => {
            if (!disposed) {
                observer.next(value)
            }
        })

        return () => {
            disposed = true
            eventDisposable.dispose()
            observer.complete()
        }
    })
}

/**
 * Create a VS Code resource while the observable is subscribed, and dispose of it when the
 * subscription is unsubscribed. The returned {@link Observable} never emits.
 */
export function vscodeResource(create: () => VSCodeDisposable): Observable<void> {
    return new Observable(() => {
        const disposable = create()
        return () => {
            disposable.dispose()
        }
    })
}

/**
 * Dispose of the given VS Code disposables when the returned {@link Observable} is unsubscribed.
 * The observable never emits.
 */
export function disposeOnUnsubscribe(...disposables: VSCodeDisposable[]): Observable<void> {
    return new Observable(() => {
        return () => {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        }
    })
}

/**
 * Create VS Code disposables for each emission, and dispose them upon the next emission or error or
 * when the returned observable is unsubscribed. The returned observable never completes.
 */
export function createDisposables<T>(
    create: (value: T) => VSCodeDisposable | VSCodeDisposable[] | undefined
): (input: ObservableLike<T>) => Observable<T> {
    let disposables: VSCodeDisposable | VSCodeDisposable[] | undefined
    function disposeAll(): void {
        if (disposables) {
            if (Array.isArray(disposables)) {
                for (const d of disposables) {
                    try {
                        d.dispose()
                    } catch {}
                }
            } else {
                try {
                    disposables.dispose()
                } catch {}
            }
        }
        disposables = undefined
    }
    return (observable: ObservableLike<T>): Observable<T> =>
        new Observable<T>(observer => {
            const subscription = observable.subscribe({
                next: value => {
                    disposeAll()
                    try {
                        disposables = create(value)
                        observer.next(value)
                    } catch (error) {
                        observer.error(error)
                    }
                },
                error: (error: any) => {
                    disposeAll()
                    observer.error(error)
                },
                complete: () => {},
            })
            return () => {
                unsubscribe(subscription)
                disposeAll()
            }
        })
}

export function pluck<T, K extends keyof T>(key: K): (input: ObservableLike<T>) => Observable<T[K]>
export function pluck<T, K1 extends keyof T, K2 extends keyof T[K1]>(
    key1: K1,
    key2: K2
): (input: ObservableLike<T>) => Observable<T[K1][K2]>
export function pluck<T>(...keyPath: any[]): (input: ObservableLike<T>) => Observable<any> {
    return map(value => {
        let valueToReturn = value
        for (const key of keyPath) {
            valueToReturn = (valueToReturn as any)[key]
        }
        return valueToReturn
    })
}

export function pick<T, K extends keyof T>(
    key: K
): (input: ObservableLike<T>) => Observable<Pick<T, K>> {
    return map(
        value =>
            ({
                [key]: value[key],
            }) as Pick<T, K>
    )
}

// biome-ignore lint/suspicious/noConfusingVoidType:
export type UnsubscribableLike = Unsubscribable | (() => void) | void | null

export function shareReplay<T>(): (observable: ObservableLike<T>) => Observable<T> {
    return (observable: ObservableLike<T>): Observable<T> => {
        const subject = new Subject<T>()
        let subscription: UnsubscribableLike = null
        let hasValue = false
        let latestValue: T
        let refCount = 0

        return new Observable<T>(observer => {
            refCount++
            if (hasValue) {
                observer.next(latestValue)
            }
            if (!subscription) {
                subscription = observable.subscribe({
                    next: value => {
                        hasValue = true
                        latestValue = value
                        subject.next(value)
                    },
                    error: error => subject.error(error),
                    complete: () => subject.complete(),
                })
            }
            const innerSub = subject.subscribe(observer)
            return () => {
                refCount--
                innerSub.unsubscribe()
                if (refCount === 0) {
                    if (subscription) {
                        unsubscribe(subscription)
                        subscription = null
                    }
                    hasValue = false
                }
            }
        })
    }
}

export function distinctUntilChanged<T>(
    isEqualFn: (a: T, b: T) => boolean = isEqual
): (observable: ObservableLike<T>) => Observable<T> {
    return (observable: ObservableLike<T>): Observable<T> => {
        return new Observable<T>(observer => {
            let lastInput: T | typeof NO_VALUES_YET = NO_VALUES_YET

            const scheduler = new AsyncSerialScheduler(observer)

            const subscription = observable.subscribe({
                complete() {
                    scheduler.complete()
                },
                error(error) {
                    scheduler.error(error)
                },
                next(input) {
                    scheduler.schedule(async next => {
                        if (lastInput === NO_VALUES_YET || !isEqualFn(lastInput as T, input)) {
                            lastInput = input
                            next(input)
                        }
                    })
                },
            })
            return () => unsubscribe(subscription)
        })
    }
}

export function tap<T>(
    observerOrNext: Partial<SubscriptionObserver<T>> | ((value: T) => void)
): (input: ObservableLike<T>) => Observable<T> {
    return (input: ObservableLike<T>) =>
        new Observable<T>(observer => {
            const tapObserver: Partial<SubscriptionObserver<T>> =
                typeof observerOrNext === 'function' ? { next: observerOrNext } : observerOrNext

            const subscription = input.subscribe({
                next(value) {
                    if (tapObserver.next) {
                        try {
                            tapObserver.next(value)
                        } catch (err) {
                            observer.error(err)
                            return
                        }
                    }
                    observer.next(value)
                },
                error(err) {
                    if (tapObserver.error) {
                        try {
                            tapObserver.error(err)
                        } catch (err) {
                            observer.error(err)
                            return
                        }
                    }
                    observer.error(err)
                },
                complete() {
                    if (tapObserver.complete) {
                        try {
                            tapObserver.complete()
                        } catch (err) {
                            observer.error(err)
                            return
                        }
                    }
                    observer.complete()
                },
            })
            return () => unsubscribe(subscription)
        })
}
export function printDiff<T extends object>(): (input: ObservableLike<T>) => Observable<T> {
    let lastValue: T | typeof NO_VALUES_YET = NO_VALUES_YET
    return map(value => {
        if (lastValue !== NO_VALUES_YET) {
            const diff = diffJson(value, lastValue)
            if (diff.length >= 2) {
                console.debug('DIFF', diff, {
                    value,
                    lastValue,
                })
            }
        }
        lastValue = value
        return value
    })
}

/** Sentinel value. */
const NO_VALUES_YET: Record<string, never> = {}

export function startWith<T, R>(value: R): (source: ObservableLike<T>) => Observable<R | T> {
    return (source: ObservableLike<T>) =>
        new Observable<R | T>(observer => {
            let sourceSubscription: UnsubscribableLike | undefined

            try {
                observer.next(value)

                sourceSubscription = source.subscribe({
                    next(val) {
                        observer.next(val)
                    },
                    error(err) {
                        observer.error(err)
                    },
                    complete() {
                        observer.complete()
                    },
                })
            } catch (err) {
                observer.error(err)
            }

            return () => {
                if (sourceSubscription) {
                    unsubscribe(sourceSubscription)
                }
            }
        })
}

export function take<T>(count: number): (source: ObservableLike<T>) => Observable<T> {
    return (source: ObservableLike<T>) =>
        new Observable<T>(observer => {
            let taken = 0
            const sourceSubscription = source.subscribe({
                next(value) {
                    if (taken < count) {
                        observer.next(value)
                        taken++
                        if (taken === count) {
                            observer.complete()
                            unsubscribe(sourceSubscription)
                        }
                    }
                },
                error(err) {
                    observer.error(err)
                },
                complete() {
                    observer.complete()
                },
            })

            return () => {
                unsubscribe(sourceSubscription)
            }
        })
}

export function mergeMap<T, R>(
    project: (value: T, index: number) => ObservableLike<R>
): (observable: ObservableLike<T>) => Observable<R> {
    return (observable: ObservableLike<T>): Observable<R> => {
        return new Observable<R>(observer => {
            let index = 0
            const innerSubscriptions = new Set<UnsubscribableLike>()
            let outerCompleted = false

            const checkComplete = () => {
                if (outerCompleted && innerSubscriptions.size === 0) {
                    observer.complete()
                }
            }

            const outerSubscription = observable.subscribe({
                next(value) {
                    const innerObservable = project(value, index++)
                    const innerSubscription = innerObservable.subscribe({
                        next(innerValue) {
                            observer.next(innerValue)
                        },
                        error(err) {
                            observer.error(err)
                        },
                        complete() {
                            innerSubscriptions.delete(innerSubscription)
                            checkComplete()
                        },
                    })
                    innerSubscriptions.add(innerSubscription)
                },
                error(err) {
                    observer.error(err)
                },
                complete() {
                    outerCompleted = true
                    checkComplete()
                },
            })

            return () => {
                unsubscribe(outerSubscription)
                for (const innerSubscription of innerSubscriptions) {
                    if (innerSubscription) {
                        unsubscribe(innerSubscription)
                    }
                }
            }
        })
    }
}

export interface StoredLastValue<T> {
    value: { last: undefined; isSet: false } | { last: T; isSet: true }
    subscription: Unsubscribable
}

/**
 * Store the last value emitted by an {@link Observable} so that it can be accessed synchronously.
 * Callers must take care to not create a race condition when using this function.
 */
export function storeLastValue<T>(observable: Observable<T>): StoredLastValue<T> {
    const value: ReturnType<typeof storeLastValue>['value'] = { last: undefined, isSet: false }
    const subscription = observable.subscribe(v => {
        Object.assign(value, { last: v, isSet: true })
    })
    return { value, subscription }
}

export function debounceTime<T>(duration: number): (source: ObservableLike<T>) => Observable<T> {
    return (source: ObservableLike<T>) =>
        new Observable<T>(observer => {
            let timeoutId: ReturnType<typeof setTimeout> | null = null
            let latestValue: T | null = null
            let hasValue = false

            const subscription = source.subscribe({
                next: value => {
                    latestValue = value
                    hasValue = true

                    if (timeoutId === null) {
                        timeoutId = setTimeout(() => {
                            if (hasValue) {
                                observer.next(latestValue!)
                                hasValue = false
                            }
                            timeoutId = null
                        }, duration)
                    }
                },
                error: err => observer.error(err),
                complete: () => {
                    if (timeoutId !== null) {
                        clearTimeout(timeoutId)
                    }
                    if (hasValue) {
                        observer.next(latestValue!)
                    }
                    observer.complete()
                },
            })

            return () => {
                unsubscribe(subscription)
                if (timeoutId !== null) {
                    clearTimeout(timeoutId)
                }
            }
        })
}

export type ObservableInputTuple<T> = {
    [K in keyof T]: ObservableLike<T[K]>
}

export function concat<T extends readonly unknown[]>(
    ...inputs: [...ObservableInputTuple<T>]
): Observable<T[number]> {
    return new Observable<T[number]>(observer => {
        let currentIndex = 0
        let currentSubscription: UnsubscribableLike = null

        function subscribeToNext() {
            if (currentIndex >= inputs.length) {
                observer.complete()
                return
            }

            const input = inputs[currentIndex]
            currentSubscription = input.subscribe({
                next: value => observer.next(value),
                error: err => observer.error(err),
                complete: () => {
                    currentIndex++
                    subscribeToNext()
                },
            })
        }

        subscribeToNext()

        return () => {
            if (currentSubscription) {
                unsubscribe(currentSubscription)
            }
        }
    })
}

export function concatMap<T, R>(
    project: (value: T, index: number) => ObservableLike<R>
): (source: ObservableLike<T>) => Observable<R> {
    return (source: ObservableLike<T>) =>
        new Observable<R>(observer => {
            let index = 0
            let isOuterCompleted = false
            let innerSubscription: UnsubscribableLike | null = null
            const outerSubscription = source.subscribe({
                next(value) {
                    try {
                        const innerObservable = project(value, index++)
                        if (innerSubscription) {
                            unsubscribe(innerSubscription)
                        }
                        innerSubscription = innerObservable.subscribe({
                            next(innerValue) {
                                observer.next(innerValue)
                            },
                            error(err) {
                                observer.error(err)
                            },
                            complete() {
                                innerSubscription = null
                                if (isOuterCompleted && !innerSubscription) {
                                    observer.complete()
                                }
                            },
                        })
                    } catch (err) {
                        observer.error(err)
                    }
                },
                error(err) {
                    observer.error(err)
                },
                complete() {
                    isOuterCompleted = true
                    if (!innerSubscription) {
                        observer.complete()
                    }
                },
            })

            return () => {
                unsubscribe(outerSubscription)
                if (innerSubscription) {
                    unsubscribe(innerSubscription)
                }
            }
        })
}

export function lifecycle<T>({
    onSubscribe,
    onUnsubscribe,
}: { onSubscribe?: () => void; onUnsubscribe?: () => void }): (
    source: ObservableLike<T>
) => Observable<T> {
    return (source: ObservableLike<T>) =>
        new Observable<T>(observer => {
            onSubscribe?.()
            const subscription = source.subscribe(observer)
            return () => {
                unsubscribe(subscription)
                onUnsubscribe?.()
            }
        })
}

export function abortableOperation<T, R>(
    operation: (input: T, signal: AbortSignal) => Promise<R>
): (source: ObservableLike<T>) => Observable<R> {
    return (source: ObservableLike<T>): Observable<R> =>
        Observable.from(source).pipe(
            mergeMap(input => promiseFactoryToObservable(signal => operation(input, signal)))
        )
}

export function catchError<T, R>(
    handler: (error: any) => ObservableLike<R>
): (source: ObservableLike<T>) => Observable<T | R> {
    return (source: ObservableLike<T>) =>
        new Observable<T | R>(observer => {
            let handlerSubscription: UnsubscribableLike | undefined
            const sourceSubscription = source.subscribe({
                next(value) {
                    observer.next(value)
                },
                error(err) {
                    try {
                        const fallback = handler(err)
                        handlerSubscription = fallback.subscribe({
                            next(value) {
                                observer.next(value)
                            },
                            error(innerErr) {
                                observer.error(innerErr)
                            },
                            complete() {
                                observer.complete()
                            },
                        })
                    } catch (handlerError) {
                        observer.error(handlerError)
                    }
                },
                complete() {
                    observer.complete()
                },
            })

            return () => {
                unsubscribe(sourceSubscription)
                if (handlerSubscription) {
                    unsubscribe(handlerSubscription)
                }
            }
        })
}

export function withLatestFrom<T, R>(
    other: ObservableLike<R>
): (source: ObservableLike<T>) => Observable<[T, R]> {
    return (source: ObservableLike<T>): Observable<[T, R]> =>
        new Observable<[T, R]>(observer => {
            let latest: R | undefined
            let hasLatest = false
            const otherSubscription = other.subscribe({
                next(value) {
                    latest = value
                    hasLatest = true
                },
                error(err) {
                    observer.error(err)
                },
            })

            const scheduler = new AsyncSerialScheduler(observer)
            const sourceSubscription = source.subscribe({
                next(value) {
                    scheduler.schedule(async next => {
                        if (hasLatest) {
                            next([value, latest!])
                        }
                    })
                },
                error(err) {
                    scheduler.error(err)
                },
                complete() {
                    scheduler.complete()
                },
            })

            return () => {
                unsubscribe(sourceSubscription)
                unsubscribe(otherSubscription)
            }
        })
}
