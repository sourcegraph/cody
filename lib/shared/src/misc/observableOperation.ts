import { Observable, type ObservableLike } from 'observable-fns'
import { isError } from '../utils'
import { catchError, filter, firstValueFrom, shareReplay, startWith, switchMap } from './observable'

/** A sentinel value to indicate that the value has not yet been emitted. */
export const pendingOperation = Symbol.for('@@pendingOperation')

/**
 * Run an operation with the outer observable as input. The result is replayed to all subscribers
 * (including future subscribers) using {@link shareReplay}, but it is immediately invalidated when
 * the outer observable emits again.
 *
 * This is a useful helper for memoizing an expensive operation. It will emit the cached value until
 * the input changes, at which point it will immediately stop emitting the cached value until the
 * operation completes with the new input.
 */
export function switchMapReplayOperation<T, R>(
    operation: (value: T) => Observable<R>
): (
    source: ObservableLike<T | typeof pendingOperation>
) => Observable<R | typeof pendingOperation | Error> {
    return (
        source: ObservableLike<T | typeof pendingOperation>
    ): Observable<R | typeof pendingOperation | Error> => {
        return Observable.from(source).pipe(
            switchMap(outerValue =>
                outerValue === pendingOperation
                    ? Observable.of(pendingOperation)
                    : operation(outerValue).pipe(
                          catchError(error =>
                              Observable.of(error instanceof Error ? error : new Error(error))
                          ),
                          startWith(pendingOperation)
                      )
            ),
            shareReplay()
        )
    }
}

/**
 * An observable pipe operator to filter out {@link pendingOperation} values.
 */
export function skipPendingOperation<T>(): (
    source: ObservableLike<T | typeof pendingOperation>
) => Observable<T> {
    return (source: ObservableLike<T | typeof pendingOperation>) =>
        Observable.from(source).pipe(filter((value): value is T => value !== pendingOperation))
}

/**
 * Wait for the first non-pending result from an operation observable (which is an observable that
 * uses {@link switchMapReplayOperation}). If the result is an error, it throws.
 */
export async function firstResultFromOperation<T>(
    observable: ObservableLike<T | typeof pendingOperation | Error>,
    signal?: AbortSignal
): Promise<T> {
    const result = await firstValueFrom(Observable.from(observable).pipe(skipPendingOperation()), signal)
    if (isError(result)) {
        throw result
    }
    return result
}
