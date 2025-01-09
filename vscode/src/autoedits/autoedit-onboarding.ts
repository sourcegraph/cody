import {
    CodyAutoSuggestionMode,
    FeatureFlag,
    currentAuthStatus,
    currentResolvedConfig,
    currentUserProductSubscription,
    featureFlagProvider,
    storeLastValue,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { localStorage } from '../services/LocalStorageProvider'
import { isUserEligibleForAutoeditsFeature } from './create-autoedits-provider'

export interface AutoeditsNotificationInfo {
    lastNotifiedTime: number
    timesShown: number
}

export class AutoeditsOnboarding implements vscode.Disposable {
    private readonly MAX_AUTO_EDITS_ONBOARDING_NOTIFICATIONS = 3
    private readonly MIN_TIME_DIFF_AUTO_EDITS_BETWEEN_NOTIFICATIONS_MS = 60 * 60 * 1000 // 1 hour

    private featureFlagAutoeditsExperimental = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutoeditExperimentEnabledFeatureFlag)
    )

    public async showAutoeditsOnboardingIfEligible(): Promise<void> {
        const shouldShowOnboardingPopup = await this.shouldShowAutoeditsOnboardingPopup()
        if (shouldShowOnboardingPopup) {
            await this.showAutoeditsOnboardingPopup()
        }
    }

    private async showAutoeditsOnboardingPopup(): Promise<void> {
        const selection = await vscode.window.showInformationMessage(
            'Try Cody Auto-Edits (experimental)? Cody will intelligently suggest next edits as you navigate the codebase.',
            'Enable Auto-Edits',
            "Don't Show Again"
        )
        await this.incrementAutoEditsOnboardingNotificationCount({ incrementCount: 1 })

        if (selection === 'Enable Auto-Edits') {
            // Enable the setting programmatically
            await vscode.workspace
                .getConfiguration()
                .update(
                    'cody.suggestions.mode',
                    CodyAutoSuggestionMode.Autoedits,
                    vscode.ConfigurationTarget.Global
                )

            // Open VS Code settings UI and focus on the Cody Autoedits setting
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'cody.suggestions.mode'
            )
        } else if (selection === "Don't Show Again") {
            // If user doesn't want to see the notification again, increase number of shown notification by max limit + 1
            // to prevent showing the notification again until the user restarts VS Code.
            await this.incrementAutoEditsOnboardingNotificationCount({
                incrementCount: this.MAX_AUTO_EDITS_ONBOARDING_NOTIFICATIONS + 1,
            })
        }
    }

    private async shouldShowAutoeditsOnboardingPopup(): Promise<boolean> {
        const isAutoeditsEnabled = await this.isAutoeditsEnabled()
        if (isAutoeditsEnabled) {
            return false
        }
        const isUserEligible = await this.isUserEligibleForAutoeditsOnboarding()
        if (!isUserEligible) {
            return false
        }
        const isUnderNotificationLimit = await this.isAutoeditsNotificationsUnderLimit()
        return isUnderNotificationLimit
    }

    private async incrementAutoEditsOnboardingNotificationCount(param: {
        incrementCount: number
    }): Promise<void> {
        const info = await this.getAutoEditsOnboardingNotificationInfo()
        await localStorage.setAutoEditsOnboardingNotificationInfo({
            timesShown: info.timesShown + param.incrementCount,
            lastNotifiedTime: Date.now(),
        })
    }

    private async isAutoeditsEnabled(): Promise<boolean> {
        const config = await currentResolvedConfig()
        return config.configuration.experimentalAutoeditsEnabled
    }

    private async isAutoeditsNotificationsUnderLimit(): Promise<boolean> {
        const info = await this.getAutoEditsOnboardingNotificationInfo()
        return (
            info.timesShown < this.MAX_AUTO_EDITS_ONBOARDING_NOTIFICATIONS &&
            Date.now() - info.lastNotifiedTime > this.MIN_TIME_DIFF_AUTO_EDITS_BETWEEN_NOTIFICATIONS_MS
        )
    }

    private async getAutoEditsOnboardingNotificationInfo(): Promise<AutoeditsNotificationInfo> {
        return localStorage.getAutoEditsOnboardingNotificationInfo()
    }

    private async isUserEligibleForAutoeditsOnboarding(): Promise<boolean> {
        const authStatus = currentAuthStatus()
        const productSubscription = await currentUserProductSubscription()
        const autoeditsFeatureFlag = this.isAutoeditsFeatureFlagEnabled()
        const { isUserEligible } = isUserEligibleForAutoeditsFeature(
            autoeditsFeatureFlag,
            authStatus,
            productSubscription
        )
        return isUserEligible
    }

    private isAutoeditsFeatureFlagEnabled(): boolean {
        return !!this.featureFlagAutoeditsExperimental.value.last
    }

    dispose(): void {
        this.featureFlagAutoeditsExperimental.subscription.unsubscribe()
    }
}
