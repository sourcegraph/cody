import {
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

export class AutoeditsOnboarding implements vscode.Disposable {
    private readonly MAX_AUTO_EDITS_ONBOARDING_NOTIFICATIONS = 3

    private featureFlagAutoeditsExperimental = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutoeditExperimentEnabledFeatureFlag)
    )

    public async showAutoeditsOnboardingIfEligible(): Promise<void> {
        const shouldShowOnboardingPopup = await this.shouldShowAutoeditsOnboardingPopup()
        if (shouldShowOnboardingPopup) {
            await this.showAutoeditsOnboardingPopup()
            await this.incrementAutoEditsOnboardingNotificationCount()
        }
    }

    private async showAutoeditsOnboardingPopup(): Promise<void> {
        const selection = await vscode.window.showInformationMessage(
            '✨ Try Cody auto-edits: Experimental feature which suggests advanced context-aware code edits as you navigate the codebase',
            'Enable auto-edits'
        )

        if (selection === 'Enable auto-edits') {
            // Enable the setting programmatically
            await vscode.workspace
                .getConfiguration()
                .update(
                    'cody.suggestions.mode',
                    'auto-edits (Experimental)',
                    vscode.ConfigurationTarget.Global
                )

            // Open VS Code settings UI and focus on the Cody Autoedits setting
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'cody.suggestions.mode'
            )
        }
    }

    private async shouldShowAutoeditsOnboardingPopup(): Promise<boolean> {
        const isUserEligible = await this.isUserEligibleForAutoeditsOnboarding()
        const isAutoeditsDisabled = await this.isAutoeditsDisabled()
        const isUnderNotificationLimit = await this.isAutoeditsNotificationsUnderLimit()
        return isUserEligible && isAutoeditsDisabled && isUnderNotificationLimit
    }

    private async incrementAutoEditsOnboardingNotificationCount(): Promise<void> {
        const count = await this.getAutoEditsOnboardingNotificationCount()
        await localStorage.setAutoEditsOnboardingNotificationCount(count + 1)
    }

    private async isAutoeditsDisabled(): Promise<boolean> {
        const config = await currentResolvedConfig()
        return !config.configuration.experimentalAutoeditsEnabled
    }

    private async isAutoeditsNotificationsUnderLimit(): Promise<boolean> {
        const count = await this.getAutoEditsOnboardingNotificationCount()
        return count < this.MAX_AUTO_EDITS_ONBOARDING_NOTIFICATIONS
    }

    private async getAutoEditsOnboardingNotificationCount(): Promise<number> {
        return await localStorage.getAutoEditsOnboardingNotificationCount()
    }

    private async isUserEligibleForAutoeditsOnboarding(): Promise<boolean> {
        const authStatus = currentAuthStatus()
        const productSubsubscription = await currentUserProductSubscription()
        const autoeditsFeatureFlag = this.isAutoeditsFeatureFlagEnabled()
        return isUserEligibleForAutoeditsFeature(
            autoeditsFeatureFlag,
            authStatus,
            productSubsubscription
        )
    }

    private isAutoeditsFeatureFlagEnabled(): boolean {
        return !!this.featureFlagAutoeditsExperimental.value.last
    }

    dispose(): void {
        this.featureFlagAutoeditsExperimental.subscription.unsubscribe()
    }
}
