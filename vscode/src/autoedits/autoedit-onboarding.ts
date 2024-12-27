import {
    FeatureFlag,
    currentAuthStatus,
    featureFlagProvider,
    isDotComAuthed,
    isS2,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { isRunningInsideAgent } from './../jsonrpc/isRunningInsideAgent'

export async function showAutoeditOnboardingIfEligible(): Promise<void> {
    // Determine if we should show the onboarding popup
    if (!shouldShowAutoeditsOnboardingPopup()) {
        return
    }

    const selection = await vscode.window.showInformationMessage(
        '✨ Try Cody Autoedits - experimental feature which suggest smarter code edits as you type.',
        'Enable Autoedits'
    )

    if (selection === 'Enable Autoedits') {
        // Enable the setting programmatically
        await vscode.workspace
            .getConfiguration()
            .update('cody.experimental.autoedits.enabled', true, vscode.ConfigurationTarget.Global)

        // Open VS Code settings UI and focus on the Cody Autoedits setting
        await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'cody.experimental.autoedits'
        )
    }
}

function shouldShowAutoeditsOnboardingPopup(): boolean {
    const isAutoeditsConfigEnabled = vscode.workspace
        .getConfiguration()
        .get<boolean>('cody.experimental.autoedits.enabled', false)

    // Do not show the onboarding popup if the feature is already enabled or any other editor than vscode.
    if (isRunningInsideAgent() || isAutoeditsConfigEnabled) {
        return false
    }

    if (isDotComAuthed()) {
        return shouldShowAutoeditsOnboardingPopupForDotComUser()
    }

    const authStatus = currentAuthStatus()
    if (isS2(authStatus)) {
        // All the S2 users should see the onboarding popup for dogfooding
        return true
    }

    // Decide later if we want to show the pop-up for the enterprise
    return false
}

function shouldShowAutoeditsOnboardingPopupForDotComUser(): boolean {
    const isUserEligibleForFeature = featureFlagProvider.evaluatedFeatureFlag(
        FeatureFlag.CodyAutoeditExperimentEnabledFeatureFlag
    )
    if (!isUserEligibleForFeature) {
        return false
    }
    return true
}
