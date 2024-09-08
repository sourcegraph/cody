import { Observable } from 'observable-fns'
import { distinctUntilChanged, firstValueFrom, fromLateSetSource, shareReplay } from '../misc/observable'
import type { PartialDeep } from '../utils'
import type { AuthStatus } from './types'

const _authStatus = fromLateSetSource<AuthStatus>()

let hasSetAuthStatusObservable = false

/**
 * Set the observable that will be used to provide the global {@link authStatus}. This should be
 * set exactly once.
 */
export function setAuthStatusObservable(input: Observable<AuthStatus>): void {
    if (hasSetAuthStatusObservable) {
        throw new Error('setAuthStatusObservable must be called exactly once total')
    }
    hasSetAuthStatusObservable = true
    _authStatus.setSource(input.pipe(distinctUntilChanged()))
}

/**
 * The auth status.
 *
 * It is intentionally global because the auth status is global.
 *
 * It is OK to access this before {@link setAuthStatusObservable} is called, but it will
 * not emit any values before then.
 */
export const authStatus: Observable<AuthStatus> = _authStatus.observable.pipe(shareReplay())

/**
 * The current auth status. Callers should use {@link authStatus} instead so that
 * they react to changes. This function is provided for old call sites that
 * haven't been updated to use an Observable.
 */
export function currentAuthStatus(): Promise<AuthStatus> {
    return firstValueFrom(authStatus)
}

/**
 * Mock the {@link authStatus} and {@link currentAuthStatus} values.
 *
 * For use in tests only.
 */
export function mockAuthStatus(value: PartialDeep<AuthStatus>): void {
    _authStatus.setSource(Observable.of(value as AuthStatus), false)
}
