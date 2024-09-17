import {
    type AuthStatus,
    type AuthenticatedAuthStatus,
    type ResolvedConfiguration,
    readValuesFrom,
} from '@sourcegraph/cody-shared'
import type { PartialDeep } from '@sourcegraph/cody-shared/src/utils'
import { type Observable, Subject } from 'observable-fns'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import * as authHelpers from '../auth/auth'
import { authProvider, newAuthProviderForTest } from './AuthProvider'
import { localStorage, mockLocalStorage } from './LocalStorageProvider'

type AuthProvider = ReturnType<typeof newAuthProviderForTest>

function asyncValue<T>(value: T, delay?: number | undefined): Promise<T> {
    return new Promise<T>(resolve => {
        setTimeout(() => resolve(value), delay)
    })
}

describe('AuthProvider', () => {
    beforeAll(() => {
        // Dispose global singleton to avoid interference in our tests.
        authProvider.dispose()

        mockLocalStorage()
    })

    let testAuthProvider: AuthProvider | undefined
    afterEach(() => {
        testAuthProvider?.dispose()
    })

    function setup(): {
        authProvider: AuthProvider
        authStatus: Observable<AuthStatus>
        resolvedConfig: Subject<ResolvedConfiguration>
    } {
        let authStatus: Observable<AuthStatus> | undefined = undefined
        const resolvedConfig = new Subject<ResolvedConfiguration>()
        testAuthProvider = newAuthProviderForTest(observable => {
            authStatus = observable
        }, resolvedConfig)
        if (!authStatus) {
            throw new Error('authStatus was not set')
        }
        return {
            authProvider: testAuthProvider,
            authStatus,
            resolvedConfig,
        }
    }

    test('observes config', async () => {
        vi.useFakeTimers()

        const authedAuthStatusAlice: AuthStatus = {
            authenticated: true,
            endpoint: 'https://example.com/',
            username: 'alice',
        } satisfies Partial<AuthenticatedAuthStatus> as AuthStatus
        const authedAuthStatusBob: AuthStatus = {
            authenticated: true,
            endpoint: 'https://other.example.com/',
            username: 'bob',
        } satisfies Partial<AuthenticatedAuthStatus> as AuthStatus

        const saveEndpointAndTokenMock = vi
            .spyOn(localStorage, 'saveEndpointAndToken')
            .mockResolvedValue(undefined)
        const validateCredentialsMock = vi
            .spyOn(authHelpers, 'validateCredentials')
            .mockReturnValue(asyncValue(authedAuthStatusAlice, 10))

        const { authStatus, resolvedConfig } = setup()
        const { values } = readValuesFrom(authStatus)
        resolvedConfig.next({
            configuration: {},
            auth: { serverEndpoint: 'https://example.com/', accessToken: 't' },
            clientState: { anonymousUserID: '123' },
        } satisfies PartialDeep<ResolvedConfiguration> as ResolvedConfiguration)

        // No synchronous emissions.
        expect(values).toStrictEqual<typeof values>([])

        // Initial emission.
        await vi.advanceTimersByTimeAsync(1)
        expect(values).toStrictEqual<typeof values>([
            { authenticated: false, endpoint: 'https://example.com/' },
        ])
        values.length = 0
        expect(validateCredentialsMock).toHaveBeenCalledTimes(1)
        expect(saveEndpointAndTokenMock).toHaveBeenCalledTimes(0)

        // After validating credentials.
        await vi.advanceTimersByTimeAsync(9)
        expect(values).toStrictEqual<typeof values>([authedAuthStatusAlice])
        values.length = 0
        expect(validateCredentialsMock).toHaveBeenCalledTimes(1)
        expect(saveEndpointAndTokenMock).toHaveBeenCalledTimes(0)

        // Update config.
        validateCredentialsMock.mockReturnValue(asyncValue(authedAuthStatusBob, 10))
        resolvedConfig.next({
            configuration: {},
            auth: { serverEndpoint: 'https://other.example.com/', accessToken: 't2' },
            clientState: { anonymousUserID: '123' },
        } satisfies PartialDeep<ResolvedConfiguration> as ResolvedConfiguration)
        await vi.advanceTimersByTimeAsync(1)
        expect(values).toStrictEqual<typeof values>([
            { authenticated: false, endpoint: 'https://other.example.com/' },
        ])
        values.length = 0
        expect(validateCredentialsMock).toHaveBeenCalledTimes(2)
        expect(saveEndpointAndTokenMock).toHaveBeenCalledTimes(0)

        // Validate updated config.
        await vi.advanceTimersByTimeAsync(9)
        expect(values).toStrictEqual<typeof values>([authedAuthStatusBob])
        values.length = 0
        expect(validateCredentialsMock).toHaveBeenCalledTimes(2)
        expect(saveEndpointAndTokenMock).toHaveBeenCalledTimes(0)
    })

    test('validateAndStoreCredentials', async () => {
        vi.useFakeTimers()

        const authedAuthStatusAlice: AuthStatus = {
            authenticated: true,
            endpoint: 'https://example.com/',
            username: 'alice',
        } satisfies Partial<AuthenticatedAuthStatus> as AuthStatus
        const authedAuthStatusBob: AuthStatus = {
            authenticated: true,
            endpoint: 'https://other.example.com/',
            username: 'bob',
        } satisfies Partial<AuthenticatedAuthStatus> as AuthStatus

        const saveEndpointAndTokenMock = vi
            .spyOn(localStorage, 'saveEndpointAndToken')
            .mockResolvedValue(undefined)
        const validateCredentialsMock = vi
            .spyOn(authHelpers, 'validateCredentials')
            .mockReturnValue(asyncValue(authedAuthStatusAlice, 10))

        const { authProvider, authStatus, resolvedConfig } = setup()
        const { values } = readValuesFrom(authStatus)
        resolvedConfig.next({
            configuration: {},
            auth: { serverEndpoint: 'https://example.com/', accessToken: 't' },
            clientState: { anonymousUserID: '123' },
        } satisfies PartialDeep<ResolvedConfiguration> as ResolvedConfiguration)

        // Initial emission.
        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>([
            { authenticated: false, endpoint: 'https://example.com/' },
            authedAuthStatusAlice,
        ])
        values.length = 0
        expect(validateCredentialsMock).toHaveBeenCalledTimes(1)
        expect(saveEndpointAndTokenMock).toHaveBeenCalledTimes(0)

        // Call validateAndStoreCredentials.
        validateCredentialsMock.mockReturnValue(asyncValue(authedAuthStatusBob, 10))
        const promise = authProvider.validateAndStoreCredentials(
            {
                configuration: {},
                auth: { serverEndpoint: 'https://other.example.com/', accessToken: 't2' },
                clientState: { anonymousUserID: '123' },
            },
            'always-store'
        )
        await vi.advanceTimersByTimeAsync(1)
        expect(values).toStrictEqual<typeof values>([])
        expect(validateCredentialsMock).toHaveBeenCalledTimes(2)
        expect(saveEndpointAndTokenMock).toHaveBeenCalledTimes(0)

        await vi.advanceTimersByTimeAsync(9)
        await promise
        expect(values).toStrictEqual<typeof values>([authedAuthStatusBob])
        expect(validateCredentialsMock).toHaveBeenCalledTimes(2)
        expect(saveEndpointAndTokenMock).toHaveBeenCalledTimes(1)
    })

    test('refresh', async () => {
        vi.useFakeTimers()

        const authedAuthStatus: AuthStatus = {
            authenticated: true,
            endpoint: 'https://example.com/',
            username: 'user',
        } satisfies Partial<AuthenticatedAuthStatus> as AuthStatus

        const validateCredentialsMock = vi
            .spyOn(authHelpers, 'validateCredentials')
            .mockReturnValue(asyncValue(authedAuthStatus, 10))

        const { authProvider, authStatus, resolvedConfig } = setup()
        const { values } = readValuesFrom(authStatus)
        resolvedConfig.next({
            configuration: {},
            auth: { serverEndpoint: 'https://example.com/', accessToken: 't' },
            clientState: { anonymousUserID: '123' },
        } satisfies PartialDeep<ResolvedConfiguration> as ResolvedConfiguration)

        // Initial authentication.
        await vi.advanceTimersByTimeAsync(11)
        expect(values).toStrictEqual<typeof values>([
            { authenticated: false, endpoint: 'https://example.com/' },
            authedAuthStatus,
        ])
        values.length = 0
        expect(validateCredentialsMock).toHaveBeenCalledTimes(1)

        // Refresh authentication.
        validateCredentialsMock.mockReturnValue(asyncValue(authedAuthStatus, 10))
        authProvider.refresh()
        await vi.advanceTimersByTimeAsync(1)
        expect(values).toStrictEqual<typeof values>([
            { authenticated: false, endpoint: 'https://example.com/' },
        ])
        values.length = 0

        await vi.advanceTimersByTimeAsync(10)
        expect(values).toStrictEqual<typeof values>([authedAuthStatus])
        values.length = 0
        expect(validateCredentialsMock).toHaveBeenCalledTimes(2)
    })
})
