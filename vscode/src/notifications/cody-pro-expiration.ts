import {
    FeatureFlag,
    type FeatureFlagProvider,
    type SourcegraphGraphQLAPIClient,
} from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import type { AuthProvider } from '../services/AuthProvider'
import { localStorage } from '../services/LocalStorageProvider'

export class CodyProExpirationNotifications implements vscode.Disposable {
    public static readonly expiredActionUrl = 'https://sourcegraph.com/cody/subscription'

    public static readonly expiredMessageText = `
                Your Cody Pro trial has ended, and you are now on the Cody Free plan.

                If you'd like to upgrade to Cody Pro, please setup your payment information. You can cancel anytime.
            `
    public static readonly nearlyExpiredActionUrl =
        'https://sourcegraph.com/cody/subscription?on-trial=true'

    public static readonly nearlyExpiredMessageText = `
                Your Cody Pro Trial is ending soon.

                Setup your payment information to continue using Cody Pro, you won't be charged until February 21.
            `
    public static readonly localStorageSuppressionKey = 'extension.codyPro.suppressExpirationNotices'

    public static readonly actionText = 'Setup Payment Info'

    public static readonly noThanksText = 'Don’t Show Again'

    /**
     * Current subscription to auth provider status changes that may trigger a check.
     */
    private authProviderSubscription: (() => void) | undefined

    /**
     * A timer if there is currently an outstanding timed check.
     */
    private nextTimedCheck: NodeJS.Timer | undefined

    /**
     * Whether we've been disposed.
     */
    private isDisposed = false

    /**
     * Set up a check (now and when auth status changes) whether to show the user a notification
     * about their Cody Pro subscription having expired (or expiring soon).
     */
    constructor(
        private readonly apiClient: SourcegraphGraphQLAPIClient,
        private readonly authProvider: AuthProvider,
        private readonly featureFlagProvider: FeatureFlagProvider,
        private readonly showInformationMessage: (
            message: string,
            ...items: string[]
        ) => Thenable<string | undefined>,
        private readonly openExternal: (target: URI) => Thenable<boolean>,
        private readonly flagCheckDelayMs: number = 1000 * 60 * 30, // 30 mins
        private readonly autoUpdateDelay: number = 1000 * 3, // 3 sec
        checkImmediately = true
    ) {
        if (checkImmediately) {
            void this.triggerExpirationCheck()
        }
    }

    /**
     * Perform an immediate check and display a notification if appropriate.
     */
    public async triggerExpirationCheck(): Promise<void> {
        if (this.shouldSuppressNotifications()) return // May have been triggered by a timer, so check again

        // Set up check for each time auth changes...
        if (!this.authProviderSubscription) {
            // HACK: authProvider listeners will fire before the GraphQL client is updated and
            // therefore checking feature flags may return incorrect results for a short period.
            //
            // As a short-term workaround, delay the check for a few seconds after the auth change
            // to allow the GraphQL client to be updated and reduce the chance of not picking up the
            // right flags.
            //
            // See https://sourcegraph.slack.com/archives/C05AGQYD528/p1706872864488829
            this.authProviderSubscription = this.authProvider.addChangeListener(() =>
                setTimeout(() => this.triggerExpirationCheck(), this.autoUpdateDelay)
            )
        }

        // Not logged in or not DotCom, don't show.
        const authStatus = this.authProvider.getAuthStatus()
        if (!authStatus.isLoggedIn || !authStatus.isDotCom) return

        const useSscForCodySubscription = await this.featureFlagProvider.evaluateFeatureFlag(
            FeatureFlag.UseSscForCodySubscription
        )
        if (this.shouldSuppressNotifications()) return // Status may have changed during await

        if (!useSscForCodySubscription) {
            // Flag has not been enabled yet, so schedule a later check.
            this.scheduleTimedCheck()
            return
        }

        const res = await this.apiClient.getCurrentUserCodySubscription()
        if (this.shouldSuppressNotifications()) return // Status may have changed during await
        if (res instanceof Error) {
            // Something went wrong - schedule a future check to try again.
            console.error(res)
            this.scheduleTimedCheck()
            return
        }

        // Only current Pro users with a Pending state (not already paid/have CC details)
        // will see notifications.
        if (res.plan !== 'PRO' || res.status !== 'PENDING') return

        // If we made it here, it's time to show a notification.
        await this.showNotification()
    }

    private async showNotification(): Promise<void> {
        const codyProTrialEnded = await this.featureFlagProvider.evaluateFeatureFlag(
            FeatureFlag.CodyProTrialEnded
        )
        if (this.shouldSuppressNotifications()) return // Status may have changed during await

        // We will now definitely show a message, so dispose so that no other checks that might overlap can also trigger this.
        this.dispose()

        let actionUrl: string
        let text: string
        if (codyProTrialEnded) {
            actionUrl = CodyProExpirationNotifications.expiredActionUrl
            text = CodyProExpirationNotifications.expiredMessageText
        } else {
            actionUrl = CodyProExpirationNotifications.nearlyExpiredActionUrl
            text = CodyProExpirationNotifications.nearlyExpiredMessageText
        }

        const actionText = CodyProExpirationNotifications.actionText
        const noThanksText = CodyProExpirationNotifications.noThanksText
        const action = await this.showInformationMessage(text, actionText, noThanksText)
        this.suppressFutureNotifications()
        if (action === actionText) {
            await this.openExternal(URI.parse(actionUrl))
        }
    }

    /**
     * Checks if it's still valid to show a notification.
     */
    private shouldSuppressNotifications(): boolean {
        if (this.isDisposed) return true

        if (localStorage.get(CodyProExpirationNotifications.localStorageSuppressionKey)) {
            this.dispose()
            return true
        }

        return false
    }

    private suppressFutureNotifications() {
        // Don't show again this session.
        this.dispose()
        // Or again in future.
        localStorage.set(CodyProExpirationNotifications.localStorageSuppressionKey, 'true')
    }

    /**
     * Schedules a future check.
     */
    private scheduleTimedCheck() {
        this.nextTimedCheck?.unref()
        this.nextTimedCheck = setTimeout(
            async () => this.triggerExpirationCheck(),
            this.flagCheckDelayMs
        )
    }

    /**
     * Stops checking and cleans up.
     *
     * Safe to call multiple times.
     */
    public dispose() {
        this.isDisposed = true

        this.authProviderSubscription?.()
        this.authProviderSubscription = undefined

        this.nextTimedCheck?.unref()
        this.nextTimedCheck = undefined
    }
}
