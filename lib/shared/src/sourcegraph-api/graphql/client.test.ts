import { Subject } from 'observable-fns'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { mockAuthStatus } from '../../auth/authStatus'
import { AUTH_STATUS_FIXTURE_AUTHED, type AuthStatus } from '../../auth/types'
import { ClientConfigSingleton } from './client'
import { graphqlClient } from './client'
import type { CodyClientConfig } from './client'

const CLIENT_CONFIG_FIXTURE: CodyClientConfig = {
    chatEnabled: true,
    autoCompleteEnabled: true,
    customCommandsEnabled: true,
    attributionEnabled: false,
    smartContextWindowEnabled: true,
    modelsAPIEnabled: false,
}

describe('ClientConfigSingleton', () => {
    let clientConfigSingleton: ClientConfigSingleton | undefined
    afterEach(() => {
        clientConfigSingleton?.dispose()
        clientConfigSingleton = undefined
    })

    test('initial', { timeout: 200 }, async () => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('5.5.0')
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()

        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)

        // Wait for the auth status initial value to be observed, and check that `refreshConfig` was
        // called and the result was cached.
        await vi.advanceTimersByTimeAsync(1)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        expect(await clientConfigSingleton.getConfig()).toEqual(CLIENT_CONFIG_FIXTURE)
        await vi.runAllTimersAsync()
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()
    })

    test('single-flight requests', { timeout: 200 }, async () => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi
            .spyOn(graphqlClient, 'getSiteVersion')
            .mockImplementation(() => new Promise<string>(resolve => setTimeout(resolve, 100, '5.5.0')))
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)

        // Wait for the auth status initial value to be observed, and check that `refreshConfig` was
        // called and the result was cached.
        await vi.advanceTimersByTimeAsync(100)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()

        // Wait for that cached value to become stale.
        await vi.advanceTimersByTimeAsync(ClientConfigSingleton.CACHE_TTL + 1)

        // Initiate multiple concurrent requests.
        const promise1 = clientConfigSingleton.getConfig()
        await vi.advanceTimersByTimeAsync(50)
        const promise2 = clientConfigSingleton.getConfig()
        await vi.advanceTimersByTimeAsync(50)
        const promise3 = clientConfigSingleton.getConfig()

        // Initiate a request that will be started *after* the 2 prior in-flight ones have
        // completed.
        await vi.advanceTimersByTimeAsync(50)
        const promise4 = clientConfigSingleton.getConfig()

        // Resolve all promises.
        const [result1, result2, result3, result4] = await Promise.all([
            promise1,
            promise2,
            promise3,
            promise4,
        ])

        // Verify that all results are the same.
        expect(result1).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(result2).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(result3).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(result4).toEqual(CLIENT_CONFIG_FIXTURE)

        // Verify that getSiteVersion and fetchHTTP were only called once.
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()
    })

    test('reuse cached value', { timeout: 200 }, async () => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi
            .spyOn(graphqlClient, 'getSiteVersion')
            .mockImplementation(() => new Promise<string>(resolve => setTimeout(resolve, 100, '5.5.0')))
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)

        // Wait for the initial value to be cached.
        await vi.advanceTimersByTimeAsync(100)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()

        // The non-stale cached value is reused.
        expect(await clientConfigSingleton.getConfig()).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(0)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)

        // Wait for that cached value to become stale.
        await vi.advanceTimersByTimeAsync(ClientConfigSingleton.CACHE_TTL + 1)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(0)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)

        // A stale cached value will still be returned, but an async refresh is triggered.
        expect(await clientConfigSingleton.getConfig()).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)
        await vi.advanceTimersByTimeAsync(100)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()
    })

    test('invalidate cached value when auth status changes', { timeout: 200 }, async () => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi
            .spyOn(graphqlClient, 'getSiteVersion')
            .mockImplementation(() => new Promise<string>(resolve => setTimeout(resolve, 100, '5.5.0')))
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)

        // Wait for the initial value to be cached.
        await vi.advanceTimersByTimeAsync(100)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()

        // Wait for that cached value to become stale.
        await vi.advanceTimersByTimeAsync(ClientConfigSingleton.CACHE_TTL + 1)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(0)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)

        // Start a request that will return immediate stale data. Its background refreshConfig call
        // will be invalidated by our next change to auth status.
        const promise1 = clientConfigSingleton.getConfig()
        await vi.advanceTimersByTimeAsync(50)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()

        // Change the auth status.
        const fixture2: CodyClientConfig = {
            ...CLIENT_CONFIG_FIXTURE,
            chatEnabled: !CLIENT_CONFIG_FIXTURE.chatEnabled,
        }
        fetchHTTPMock.mockResolvedValue(fixture2)
        authStatusSubject.next({ ...AUTH_STATUS_FIXTURE_AUTHED, endpoint: 'https://other.example.com' })

        // Start another promise after the auth status change, which will NOT return stale data.
        await vi.advanceTimersByTimeAsync(1)
        const promise2 = clientConfigSingleton.getConfig()

        // The request we made above returns the old data because it returned it (essentially)
        // synchronously from its cache, so it the auth status change had not happened yet.
        expect(await promise1).toEqual(CLIENT_CONFIG_FIXTURE)
        await vi.advanceTimersByTimeAsync(99)
        expect(await promise2).toEqual(fixture2)

        // Ensure that the new value is returned.
        expect(await clientConfigSingleton.getConfig()).toEqual(fixture2)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()
    })
})
