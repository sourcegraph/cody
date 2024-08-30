import { afterEach, beforeEach, describe, expect, it, vi, vitest } from 'vitest'
import { localStorage } from '../services/LocalStorageProvider'

import {
    type AuthStatus,
    FeatureFlag,
    type FeatureFlagProvider,
    type GraphQLAPIClientConfig,
    type SourcegraphGraphQLAPIClient,
    defaultAuthStatus,
    featureFlagProvider,
    graphqlClient,
} from '@sourcegraph/cody-shared'
import { type AuthProvider, authProvider } from '../services/AuthProvider'
import { CodyProExpirationNotifications } from './cody-pro-expiration'

describe('Cody Pro expiration notifications', () => {
    let notifier: CodyProExpirationNotifications
    let apiClient: SourcegraphGraphQLAPIClient
    let authStatus: AuthStatus
    let authChangeListener = () => {}
    let codyPlan: string
    let codyStatus: string
    const showInformationMessage = vitest.fn()
    const openExternal = vitest.fn()
    const enabledFeatureFlags = new Set<FeatureFlag>()

    const localStorageKey = CodyProExpirationNotifications.localStorageSuppressionKey

    // Set up local storage backed by an object.
    let localStorageData: { [key: string]: unknown } = {}
    localStorage.setStorage({
        get: (key: string) => localStorageData[key],
        update: (key: string, value: unknown) => {
            localStorageData[key] = value
        },
    } as any)

    beforeEach(() => {
        // Set everything up by default as a logged in DotCom users with Pro that has expired. This makes it
        // easier for tests to verify individual conditions that should prevent showing the notification.
        codyStatus = 'PENDING'
        codyPlan = 'PRO'
        enabledFeatureFlags.clear()
        enabledFeatureFlags.add(FeatureFlag.UseSscForCodySubscription)
        enabledFeatureFlags.add(FeatureFlag.CodyProTrialEnded)
        featureFlagProvider.instance = {
            evaluateFeatureFlag: (flag: FeatureFlag) => Promise.resolve(enabledFeatureFlags.has(flag)),
            refresh: () => {},
        } as FeatureFlagProvider
        graphqlClient.setConfig({} as unknown as GraphQLAPIClientConfig)
        apiClient = {
            getCurrentUserCodySubscription: () => ({
                status: codyStatus,
                plan: codyPlan,
            }),
        } as unknown as SourcegraphGraphQLAPIClient
        authProvider.instance = {
            changes: {
                subscribe: (f: () => void) => {
                    authChangeListener = f
                    // (return an object that simulates the unsubscribe
                    return {
                        unsubscribe: () => {
                            authChangeListener = () => {}
                        },
                    }
                },
            },
            getAuthStatus: () => authStatus,
        } as AuthProvider
        authStatus = { ...defaultAuthStatus, isLoggedIn: true, isDotCom: true }
        localStorageData = {}
    })

    afterEach(() => {
        vi.restoreAllMocks()
        authProvider.instance = null
        featureFlagProvider.instance = null
        notifier?.dispose()
    })

    function createNotifier() {
        return new CodyProExpirationNotifications(
            apiClient,
            showInformationMessage,
            openExternal,
            10,
            0,
            false
        )
    }

    function expectExpiredNotification() {
        expect(showInformationMessage).toHaveBeenCalledOnce()
        expect(showInformationMessage).toHaveBeenCalledWith(
            CodyProExpirationNotifications.expiredMessageText,
            CodyProExpirationNotifications.actionText,
            CodyProExpirationNotifications.noThanksText
        )
    }

    function expectExpiringSoonNotification() {
        expect(showInformationMessage).toHaveBeenCalledOnce()
        expect(showInformationMessage).toHaveBeenCalledWith(
            CodyProExpirationNotifications.nearlyExpiredMessageText,
            CodyProExpirationNotifications.actionText,
            CodyProExpirationNotifications.noThanksText
        )
    }

    function expectNoNotification() {
        expect(showInformationMessage).not.toHaveBeenCalled()
    }

    /**
     * Default case shows notification. Other tests override the default conditions.
     */
    it('shows expired notification', async () => {
        await createNotifier().triggerExpirationCheck()
        expectExpiredNotification()
    })

    it('shows nearing expiry notification', async () => {
        enabledFeatureFlags.delete(FeatureFlag.CodyProTrialEnded)
        await createNotifier().triggerExpirationCheck()
        expectExpiringSoonNotification()
    })

    it('shows only once in a session', async () => {
        const notifier = createNotifier()
        await Promise.all([notifier.triggerExpirationCheck(), notifier.triggerExpirationCheck()])
        expectExpiredNotification()
    })

    it('does not show if suppressed by LocalStorage', async () => {
        localStorageData[localStorageKey] = 'true'
        const notifier = createNotifier()
        await notifier.triggerExpirationCheck()
        expect(showInformationMessage).not.toHaveBeenCalledOnce()
    })

    it('records suppression to LocalStorage if closed', async () => {
        showInformationMessage.mockResolvedValue(undefined)
        const notifier = createNotifier()
        await notifier.triggerExpirationCheck()
        expect(localStorageData[localStorageKey]).toBeTruthy()
    })

    it('records suppression to LocalStorage if first button (Subscribe) clicked"', async () => {
        showInformationMessage.mockImplementation((text, buttons) => Promise.resolve(buttons[0]))
        const notifier = createNotifier()
        await notifier.triggerExpirationCheck()
        expect(localStorageData[localStorageKey]).toBeTruthy()
    })

    it('records suppression to LocalStorage if second button (No thanks) clicked"', async () => {
        showInformationMessage.mockImplementation((text, buttons) => Promise.resolve(buttons[1]))
        const notifier = createNotifier()
        await notifier.triggerExpirationCheck()
        expect(localStorageData[localStorageKey]).toBeTruthy()
    })

    it('does not show if not logged in', async () => {
        authStatus.isLoggedIn = false
        await createNotifier().triggerExpirationCheck()
        expectNoNotification()
    })

    it('does not show if not DotCom', async () => {
        authStatus.isDotCom = false
        await createNotifier().triggerExpirationCheck()
        expectNoNotification()
    })

    it('does not show if not currently PRO', async () => {
        codyPlan = 'NOT-PRO'
        await createNotifier().triggerExpirationCheck()
        expectNoNotification()
    })

    it('does not show if status is not PENDING', async () => {
        codyStatus = 'NOT-PENDING'
        await createNotifier().triggerExpirationCheck()
        expectNoNotification()
    })

    it('does not show if UseSscForCodySubscription not set', async () => {
        enabledFeatureFlags.delete(FeatureFlag.UseSscForCodySubscription)
        await createNotifier().triggerExpirationCheck()
        expectNoNotification()
    })

    it('shows later if UseSscForCodySubscription is enabled after some period', async () => {
        // Not shown initially because no flag.
        enabledFeatureFlags.delete(FeatureFlag.UseSscForCodySubscription)
        await createNotifier().triggerExpirationCheck()
        expectNoNotification()

        // For testing, our poll period is set to 10ms, so enable the flag and then wait
        // to allow that to trigger
        enabledFeatureFlags.add(FeatureFlag.UseSscForCodySubscription)
        featureFlagProvider.instance!.refresh() // Force clear cache of feature flags
        await new Promise(resolve => setTimeout(resolve, 20))

        // Should have been called by the timer.
        expect(showInformationMessage).toHaveBeenCalled()
    })

    it('shows later if auth status changes', async () => {
        // Not shown initially because not logged in
        authStatus.isLoggedIn = false
        await createNotifier().triggerExpirationCheck()
        expectNoNotification()

        // Simulate login status change.
        authStatus.isLoggedIn = true
        authChangeListener()

        // Allow time async operations (checking feature flags) to run as part of the check
        // before we expect. We have nothing we can wait on here.
        await new Promise(resolve => setTimeout(resolve, 100))

        // Should have been called by the auth status trigger.
        expect(showInformationMessage).toHaveBeenCalled()
    })
})
