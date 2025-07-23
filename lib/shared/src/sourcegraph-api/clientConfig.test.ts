import { Subject } from 'observable-fns'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { mockAuthStatus } from '../auth/authStatus'
import { AUTH_STATUS_FIXTURE_AUTHED, type AuthStatus } from '../auth/types'
import { setEditorWindowIsFocused } from '../editor/editorState'
import { testing__firstValueFromWithinTime } from '../misc/observable'
import { skipPendingOperation } from '../misc/observableOperation'
import { ClientConfigSingleton, type CodyClientConfig } from './clientConfig'
import { graphqlClient } from './graphql/client'

const CLIENT_CONFIG_FIXTURE: CodyClientConfig = {
    chatEnabled: true,
    chatCodeHighlightingEnabled: true,
    autoCompleteEnabled: true,
    customCommandsEnabled: true,
    attributionEnabled: false,
    attribution: 'none',
    smartContextWindowEnabled: true,
    modelsAPIEnabled: false,
    notices: [],
    omniBoxEnabled: false,
    codeSearchEnabled: true,
    siteVersion: '5.5.0',
}

describe('ClientConfigSingleton', () => {
    setEditorWindowIsFocused(() => true)

    let clientConfigSingleton: ClientConfigSingleton | undefined
    afterEach(() => {
        clientConfigSingleton = undefined
    })

    test('initial', { timeout: 200 }, async task => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('5.5.0')
        const viewerSettingsMock = vi.spyOn(graphqlClient, 'viewerSettings').mockResolvedValue({})
        const codeSearchEnabledMock = vi
            .spyOn(graphqlClient, 'codeSearchEnabled')
            .mockResolvedValue(true)
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()

        // Mimic the situation where there are other active subscribers and we are sharing the
        // replay.
        const subscription = clientConfigSingleton.changes.subscribe({})
        task.onTestFinished(() => subscription.unsubscribe())

        // Wait for the auth status initial value to be observed, and check that `refreshConfig` was
        // called and the result was cached.
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)
        await vi.advanceTimersByTimeAsync(0)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(viewerSettingsMock).toHaveBeenCalledTimes(1)
        expect(codeSearchEnabledMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        expect(await clientConfigSingleton.getConfig()).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        viewerSettingsMock.mockClear()
        codeSearchEnabledMock.mockClear()
        fetchHTTPMock.mockClear()
    })

    test('refetch interval', { timeout: 200 }, async task => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('5.5.0')
        const viewerSettingsMock = vi.spyOn(graphqlClient, 'viewerSettings').mockResolvedValue({})
        const codeSearchEnabledMock = vi
            .spyOn(graphqlClient, 'codeSearchEnabled')
            .mockResolvedValue(true)
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()

        // Mimic the situation where there are other active subscribers and we are sharing the
        // replay.
        const subscription = clientConfigSingleton.changes.subscribe({})
        task.onTestFinished(() => subscription.unsubscribe())

        // Wait for the auth status initial value to be observed.
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)
        await vi.advanceTimersByTimeAsync(0)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(viewerSettingsMock).toHaveBeenCalledTimes(1)
        expect(codeSearchEnabledMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        viewerSettingsMock.mockClear()
        codeSearchEnabledMock.mockClear()
        fetchHTTPMock.mockClear()

        // Set a different response for the next refetch.
        const fixture2: CodyClientConfig = {
            ...CLIENT_CONFIG_FIXTURE,
            modelsAPIEnabled: !CLIENT_CONFIG_FIXTURE.modelsAPIEnabled,
        }
        fetchHTTPMock.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 100))
            return fixture2
        })

        // Ensure that the stale value (for the same endpoint) is still used while we refetch.
        await vi.advanceTimersByTimeAsync(ClientConfigSingleton.REFETCH_INTERVAL)
        expect(await clientConfigSingleton.getConfig()).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()

        // When the refetch is complete, ensure the new value is emitted.
        await vi.advanceTimersByTimeAsync(100)
        expect(await clientConfigSingleton.getConfig()).toEqual(fixture2)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(0)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)
    })

    test('single-flight requests', { timeout: 200 }, async task => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi
            .spyOn(graphqlClient, 'getSiteVersion')
            .mockImplementation(() => new Promise<string>(resolve => setTimeout(resolve, 100, '5.5.0')))

        const viewerSettingsMock = vi.spyOn(graphqlClient, 'viewerSettings').mockResolvedValue({})
        const codeSearchEnabledMock = vi
            .spyOn(graphqlClient, 'codeSearchEnabled')
            .mockResolvedValue(true)
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()

        // Mimic the situation where there are other active subscribers and we are sharing the
        // replay.
        const subscription = clientConfigSingleton.changes.subscribe({})
        task.onTestFinished(() => subscription.unsubscribe())

        // Wait for the auth status initial value to be observed, and check that `refreshConfig` was
        // called and the result was cached.
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)
        await vi.advanceTimersByTimeAsync(100)
        getSiteVersionMock.mockClear()
        fetchHTTPMock.mockClear()

        // Wait for that cached value to become stale.
        await vi.advanceTimersByTimeAsync(ClientConfigSingleton.REFETCH_INTERVAL + 1)

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
        viewerSettingsMock.mockClear()
        codeSearchEnabledMock.mockClear()
        fetchHTTPMock.mockClear()
    })

    test('reuse cached value', { timeout: 200 }, async task => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi
            .spyOn(graphqlClient, 'getSiteVersion')
            .mockImplementation(() => new Promise<string>(resolve => setTimeout(resolve, 100, '5.5.0')))
        const viewerSettingsMock = vi.spyOn(graphqlClient, 'viewerSettings').mockResolvedValue({})
        const codeSearchEnabledMock = vi
            .spyOn(graphqlClient, 'codeSearchEnabled')
            .mockResolvedValue(true)
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()

        // Mimic the situation where there are other active subscribers and we are sharing the
        // replay.
        const subscription = clientConfigSingleton.changes.subscribe({})
        task.onTestFinished(() => subscription.unsubscribe())

        // Wait for the initial value to be cached.
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)
        await vi.advanceTimersByTimeAsync(100)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        viewerSettingsMock.mockClear()
        codeSearchEnabledMock.mockClear()
        fetchHTTPMock.mockClear()

        // The non-stale cached value is reused.
        expect(await clientConfigSingleton.getConfig()).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(0)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)

        // Wait for that cached value to become stale, and confirm that a refetch was triggered.
        const fixture2: CodyClientConfig = {
            ...CLIENT_CONFIG_FIXTURE,
            modelsAPIEnabled: !CLIENT_CONFIG_FIXTURE.modelsAPIEnabled,
        }
        fetchHTTPMock.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 100))
            return fixture2
        })
        await vi.advanceTimersByTimeAsync(ClientConfigSingleton.REFETCH_INTERVAL + 1)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(viewerSettingsMock).toHaveBeenCalledTimes(0)
        expect(codeSearchEnabledMock).toHaveBeenCalledTimes(0)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        viewerSettingsMock.mockClear()
        codeSearchEnabledMock.mockClear()
        fetchHTTPMock.mockClear()

        // A stale cached value will still be returned.
        expect(await clientConfigSingleton.getConfig()).toEqual(CLIENT_CONFIG_FIXTURE)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(0)
        expect(viewerSettingsMock).toHaveBeenCalledTimes(0)
        expect(codeSearchEnabledMock).toHaveBeenCalledTimes(0)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)

        // When the refetch is done, the new data is used and is available without a refetch.
        await vi.advanceTimersByTimeAsync(100)
        expect(await clientConfigSingleton.getConfig()).toEqual(fixture2)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(0)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(0)
        getSiteVersionMock.mockClear()
        viewerSettingsMock.mockClear()
        codeSearchEnabledMock.mockClear()
        fetchHTTPMock.mockClear()
    })

    test('invalidate cached value when auth status changes', { timeout: 200 }, async task => {
        vi.useFakeTimers()
        const authStatusSubject = new Subject<AuthStatus>()
        mockAuthStatus(authStatusSubject)
        const getSiteVersionMock = vi
            .spyOn(graphqlClient, 'getSiteVersion')
            .mockImplementation(() => new Promise<string>(resolve => setTimeout(resolve, 100, '5.5.0')))
        const viewerSettingsMock = vi.spyOn(graphqlClient, 'viewerSettings').mockResolvedValue({})
        const codeSearchEnabledMock = vi
            .spyOn(graphqlClient, 'codeSearchEnabled')
            .mockResolvedValue(true)
        const fetchHTTPMock = vi
            .spyOn(graphqlClient, 'fetchHTTP')
            .mockResolvedValue(CLIENT_CONFIG_FIXTURE)
        clientConfigSingleton = ClientConfigSingleton.testing__new()

        // Mimic the situation where there are other active subscribers and we are sharing the
        // replay.
        const subscription = clientConfigSingleton.changes.subscribe({})
        task.onTestFinished(() => subscription.unsubscribe())

        // Wait for the initial value to be cached.
        authStatusSubject.next(AUTH_STATUS_FIXTURE_AUTHED)
        await vi.advanceTimersByTimeAsync(100)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(viewerSettingsMock).toHaveBeenCalledTimes(1)
        expect(codeSearchEnabledMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        viewerSettingsMock.mockClear()
        codeSearchEnabledMock.mockClear()
        fetchHTTPMock.mockClear()

        // Change the auth status.
        const fixture2: CodyClientConfig = {
            ...CLIENT_CONFIG_FIXTURE,
            chatEnabled: !CLIENT_CONFIG_FIXTURE.chatEnabled,
            chatCodeHighlightingEnabled: CLIENT_CONFIG_FIXTURE.chatCodeHighlightingEnabled,
        }
        fetchHTTPMock.mockResolvedValue(fixture2)
        authStatusSubject.next({ ...AUTH_STATUS_FIXTURE_AUTHED, endpoint: 'https://other.example.com' })

        // Ensure that the cached value is immediately invalidated.
        await vi.advanceTimersByTimeAsync(0)
        expect(
            await testing__firstValueFromWithinTime(
                clientConfigSingleton.changes.pipe(skipPendingOperation()),
                0,
                vi
            )
        ).toBe(undefined)
        await vi.advanceTimersByTimeAsync(100)
        expect(await clientConfigSingleton.getConfig()).toEqual(fixture2)
        expect(getSiteVersionMock).toHaveBeenCalledTimes(1)
        expect(viewerSettingsMock).toHaveBeenCalledTimes(1)
        expect(fetchHTTPMock).toHaveBeenCalledTimes(1)
        getSiteVersionMock.mockClear()
        viewerSettingsMock.mockClear()
        codeSearchEnabledMock.mockClear()
        fetchHTTPMock.mockClear()
    })
})
