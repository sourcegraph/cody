import {
    CodyAutoSuggestionMode,
    FeatureFlag,
    currentAuthStatus,
    currentResolvedConfig,
    currentUserProductSubscription,
    featureFlagProvider,
    storeLastValue,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { localStorage } from '../services/LocalStorageProvider'
import { isUserEligibleForAutoeditsFeature } from './create-autoedits-provider'

export interface AutoEditNotificationInfo {
    lastNotifiedTime: number
    timesShown: number
}

const userNotificationAction = {
    notificationAccepted: 1,
    notificationRejected: 2,
    notificationIgnored: 3,
} as const

interface AutoeditsNotificationPayload {
    timesNotified: number
    actionTaken: (typeof userNotificationAction)[keyof typeof userNotificationAction]
}

export class AutoEditOnboarding implements vscode.Disposable {
    private readonly MAX_AUTO_EDITS_ONBOARDING_NOTIFICATIONS = 3
    private readonly MIN_TIME_DIFF_AUTO_EDITS_BETWEEN_NOTIFICATIONS_MS = 60 * 60 * 1000 // 1 hour

    private featureFlagAutoEditExperimental = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutoEditExperimentEnabledFeatureFlag)
    )

    public async showAutoEditOnboardingIfEligible(): Promise<void> {
        const shouldShowOnboardingPopup = await this.shouldShowAutoEditOnboardingPopup()
        if (shouldShowOnboardingPopup) {
            await this.showAutoEditOnboardingPopup()
        }
    }

    private async showAutoEditOnboardingPopup(): Promise<void> {
        const { timesShown } = await this.getAutoEditsOnboardingNotificationInfo()

        const enableAutoeditsText = 'Enable Auto-Edits'
        const dontShowAgainText = "Don't Show Again"

        const selection = await Promise.race([
            vscode.window.showInformationMessage(
                'Try Cody Auto-Edits (experimental)? Cody will intelligently suggest next edits as you navigate the codebase.',
                enableAutoeditsText,
                dontShowAgainText
            ),
            new Promise<string | undefined>(
                resolve => setTimeout(() => resolve(undefined), 30_000) // 30 seconds timeout
            ),
        ])
        await this.incrementAutoEditsOnboardingNotificationCount({ incrementCount: 1 })

        if (selection === enableAutoeditsText) {
            // Enable the setting programmatically
            await vscode.workspace
                .getConfiguration()
                .update(
                    'cody.suggestions.mode',
                    CodyAutoSuggestionMode.Autoedit,
                    vscode.ConfigurationTarget.Global
                )

            // Open VS Code settings UI and focus on the Cody AutoEdit setting
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'cody.suggestions.mode'
            )
        } else if (selection === dontShowAgainText) {
            // If user doesn't want to see the notification again, increase number of shown notification by max limit + 1
            // to prevent showing the notification again until the user restarts VS Code.
            await this.incrementAutoEditOnboardingNotificationCount({
                incrementCount: this.MAX_AUTO_EDITS_ONBOARDING_NOTIFICATIONS + 1,
            })
        }

        const notificationPayload: AutoeditsNotificationPayload = {
            timesNotified: timesShown,
            actionTaken:
                selection === enableAutoeditsText
                    ? userNotificationAction.notificationAccepted
                    : selection === dontShowAgainText
                      ? userNotificationAction.notificationRejected
                      : userNotificationAction.notificationIgnored,
        }
        this.writeAutoeditsNotificationEvent(notificationPayload)
    }

    private writeAutoeditsNotificationEvent(payload: AutoeditsNotificationPayload): void {
        telemetryRecorder.recordEvent('cody.autoedit', 'notified', {
            version: 0,
            metadata: {
                timesNotified: payload.timesNotified,
                userActionTaken: payload.actionTaken,
            },
        })
    }

    private async shouldShowAutoEditOnboardingPopup(): Promise<boolean> {
        const isAutoEditEnabled = await this.isAutoEditEnabled()
        if (isAutoEditEnabled) {
            return false
        }
        const isUserEligible = await this.isUserEligibleForAutoEditOnboarding()
        if (!isUserEligible) {
            return false
        }
        const isUnderNotificationLimit = await this.isAutoEditNotificationsUnderLimit()
        return isUnderNotificationLimit
    }

    private async incrementAutoEditOnboardingNotificationCount(param: {
        incrementCount: number
    }): Promise<void> {
        const info = await this.getAutoEditsOnboardingNotificationInfo()
        await localStorage.setAutoEditsOnboardingNotificationInfo({
            timesShown: info.timesShown + param.incrementCount,
            lastNotifiedTime: Date.now(),
        })
    }

    private async isAutoEditEnabled(): Promise<boolean> {
        const config = await currentResolvedConfig()
        return config.configuration.experimentalAutoEditEnabled
    }

    private async isAutoEditNotificationsUnderLimit(): Promise<boolean> {
        const info = await this.getAutoEditsOnboardingNotificationInfo()
        return (
            info.timesShown < this.MAX_AUTO_EDITS_ONBOARDING_NOTIFICATIONS &&
            Date.now() - info.lastNotifiedTime > this.MIN_TIME_DIFF_AUTO_EDITS_BETWEEN_NOTIFICATIONS_MS
        )
    }

    private async getAutoEditsOnboardingNotificationInfo(): Promise<AutoEditNotificationInfo> {
        return localStorage.getAutoEditsOnboardingNotificationInfo()
    }

    private async isUserEligibleForAutoEditOnboarding(): Promise<boolean> {
        const authStatus = currentAuthStatus()
        const productSubscription = await currentUserProductSubscription()
        const autoEditFeatureFlag = this.isAutoEditFeatureFlagEnabled()
        const { isUserEligible } = isUserEligibleForAutoeditsFeature(
            autoEditFeatureFlag,
            authStatus,
            productSubscription
        )
        return isUserEligible
    }

    private isAutoEditFeatureFlagEnabled(): boolean {
        return !!this.featureFlagAutoEditExperimental.value.last
    }

    dispose(): void {
        this.featureFlagAutoEditExperimental.subscription.unsubscribe()
    }
}
