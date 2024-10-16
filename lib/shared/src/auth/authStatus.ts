import { Observable } from 'observable-fns'
import { distinctUntilChanged, fromLateSetSource, shareReplay, storeLastValue } from '../misc/observable'
import { isDotCom } from '../sourcegraph-api/environments'
import type { PartialDeep } from '../utils'
import {
    AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
    type AuthStatus,
    type AuthenticatedAuthStatus,
} from './types'

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

const { value: syncValue, subscription: syncValueSubscription } = storeLastValue(authStatus)

/**
 * The current auth status. Callers should use {@link authStatus} instead so that they react to
 * changes. This function is provided for old call sites that haven't been updated to use an
 * Observable.
 *
 * Callers should take care to avoid race conditions and prefer observing {@link authStatus}.
 *
 * Throws if the auth status is not yet ready; see {@link statusOrNotReadyYet}.
 */
export function currentAuthStatus(): AuthStatus {
    if (!syncValue.isSet) {
        throw new Error('AuthStatus is not initialized')
    }
    return syncValue.last
}

/**
 * Like {@link currentAuthStatus}, but throws if unauthenticated.
 *
 * Callers should take care to avoid race conditions and prefer observing {@link authStatus}.
 */
export function currentAuthStatusAuthed(): AuthenticatedAuthStatus {
    const authStatus = currentAuthStatus()
    if (!authStatus.authenticated) {
        throw new Error('Not authenticated')
    }
    return authStatus
}

/** Like {@link currentAuthStatus}, but does NOT throw if not ready. */
export function currentAuthStatusOrNotReadyYet(): AuthStatus | undefined {
    return syncValue.last
}

/**
 * Whether a user is authenticated on DotCom.
 */
export function isDotComAuthed(): boolean {
    const authStatus = currentAuthStatusOrNotReadyYet()
    return Boolean(authStatus?.authenticated && isDotCom(authStatus))
}

/**
 * Mock the {@link authStatus} and {@link currentAuthStatus} values.
 * Uses {@link AUTH_STATUS_FIXTURE_AUTHED_DOTCOM} as an auth status by default.
 *
 * For use in tests only.
 */
export function mockAuthStatus(
    value: PartialDeep<AuthStatus> | Observable<AuthStatus> = AUTH_STATUS_FIXTURE_AUTHED_DOTCOM
): void {
    if (value instanceof Observable) {
        _authStatus.setSource(value, false)
        return
    }
    _authStatus.setSource(Observable.of(value as AuthStatus), false)
    Object.assign(syncValue, { last: value, isSet: true })
    syncValueSubscription.unsubscribe()
}
