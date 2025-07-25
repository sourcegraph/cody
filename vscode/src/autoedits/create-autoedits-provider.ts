import { type Observable, map } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ChatClient,
    CodyAutoSuggestionMode,
    NEVER,
    type PickResolvedConfiguration,
    combineLatest,
    createDisposables,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'
import type { FixupController } from '../non-stop/FixupController'

import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { CodyStatusBar } from '../services/StatusBar'
import { AutoeditsProvider } from './autoedits-provider'
import { AutoeditDebugPanel } from './debug-panel/debug-panel'
import { isHotStreakEnabledInSettings } from './hot-streak/utils'
import { autoeditsOutputChannelLogger } from './output-channel-logger'

const AUTOEDITS_NON_ELIGIBILITY_MESSAGES = {
    PRO_USER_ONLY: 'Auto-edit requires Cody Pro subscription.',
    FEATURE_FLAG_NOT_ELIGIBLE:
        'Auto-edit is an experimental feature and currently not enabled for your account. Please check back later.',
}

/**
 * Information about a user's eligibility for auto-edit functionality.
 */
interface AutoeditsUserEligibilityInfo {
    /**
     * Whether the user is eligible to use auto-edit.
     */
    isUserEligible: boolean

    /**
     * The reason why the user is not eligible for auto-edit, if applicable.
     * The message can be shown to the user, why auto-edit are not available to them.
     */
    nonEligibilityReason?: string
}

interface AutoeditsItemProviderArgs {
    config: PickResolvedConfiguration<{ configuration: true }>
    authStatus: AuthStatus
    chatClient: ChatClient
    autoeditFeatureFlagEnabled: boolean
    autoeditHotStreakEnabled: boolean
    autoeditUseWebSocketEnabled: boolean
    fixupController: FixupController
    statusBar: CodyStatusBar
    context: vscode.ExtensionContext
}

export function createAutoEditsProvider({
    config: { configuration },
    authStatus,
    chatClient,
    autoeditFeatureFlagEnabled,
    autoeditHotStreakEnabled,
    autoeditUseWebSocketEnabled,
    fixupController,
    statusBar,
    context,
}: AutoeditsItemProviderArgs): Observable<void> {
    if (!configuration.experimentalAutoEditEnabled) {
        return NEVER
    }

    if (!authStatus.authenticated) {
        if (!authStatus.pendingValidation) {
            autoeditsOutputChannelLogger.logDebug('createProvider', 'You are not signed in.')
        }
        return NEVER
    }

    return combineLatest().pipe(
        skipPendingOperation(),
        createDisposables(() => {
            const userEligibilityInfo = isUserEligibleForAutoeditsFeature(autoeditFeatureFlagEnabled)
            if (!userEligibilityInfo.isUserEligible) {
                handleAutoeditsNotificationForNonEligibleUser(userEligibilityInfo.nonEligibilityReason)
                return []
            }

            // Hot streak is not supported in Agent right now.
            // We do not have support for reliably chunking and next cursor suggestions.
            const shouldHotStreak =
                !isRunningInsideAgent() && (autoeditHotStreakEnabled || isHotStreakEnabledInSettings())
            const provider = new AutoeditsProvider(chatClient, fixupController, statusBar, {
                shouldHotStreak,
                allowUsingWebSocket: autoeditUseWebSocketEnabled,
            })
            return [
                vscode.commands.registerCommand('cody.command.autoedit-manual-trigger', async () =>
                    provider.manuallyTriggerCompletion()
                ),
                vscode.languages.registerInlineCompletionItemProvider(
                    [{ scheme: 'file', language: '*' }, { notebookType: '*' }],
                    provider
                ),
                vscode.commands.registerCommand('cody.command.autoedit.open-debug-panel', () => {
                    AutoeditDebugPanel.showPanel(context)
                }),
                provider,
            ]
        }),
        map(() => undefined)
    )
}

/**
 * Displays an error notification to the user about non-eligibility for auto edits,
 * but only if the user is currently in the Settings view (to avoid spamming them).
 *
 * This is because because of the flaky network issues we could evaluate the default feature flag value to false
 * and show the non eligibility notification to the user even if they have access to the feature.
 * Generally the users should see the notification only when they manually change the vscode config which could be either
 * through the settings UI or `settings.json` file.
 *
 * @param {string | undefined} nonEligibilityReason - The reason why the user is currently not eligible
 *                                                   for auto edits. If not provided, no notification occurs.
 */
async function handleAutoeditsNotificationForNonEligibleUser(
    nonEligibilityReason?: string
): Promise<void> {
    if (!nonEligibilityReason || !isSettingsEditorOpen()) {
        return
    }

    const switchToAutocompleteText = 'Switch to autocomplete'
    const selection = await vscode.window.showErrorMessage(
        `Error: ${nonEligibilityReason}`,
        switchToAutocompleteText
    )
    if (selection === switchToAutocompleteText) {
        await vscode.workspace
            .getConfiguration()
            .update(
                'cody.suggestions.mode',
                CodyAutoSuggestionMode.Autocomplete,
                vscode.ConfigurationTarget.Global
            )
    }
}

/**
 * Checks whether the current view in VS Code is the Settings editor (JSON or UI).
 *
 * This function performs two checks:
 *   1. Detect if the active text editor points to a known settings file (e.g., settings.json, settings.jsonc).
 *   2. If there's no text editor open, examine the "Tab" label to see if it's the built-in Settings UI.
 *
 * Note: Using the tab's label is locale-specific; if a user runs VS Code in a non-English locale,
 *       or if the label changes in future VS Code versions, this heuristic may fail.
 *
 * @returns {boolean} True if the user is most likely viewing the Settings editor (JSON or UI), false otherwise.
 */
function isSettingsEditorOpen(): boolean {
    const activeEditor = vscode.window.activeTextEditor

    // 1) If there's an active text editor, check if the file name matches typical settings files
    if (activeEditor) {
        const fsPath = activeEditor.document.uri.fsPath
        if (fsPath.endsWith('settings.json') || fsPath.endsWith('settings.jsonc')) {
            return true
        }
        return false
    }

    // 2) If there's no activeTextEditor, the user might be in the graphical Settings UI or have no editor at all
    const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab
    if (!activeTab) {
        // No tab at all: definitely not a JSON settings file;
        // could be just an empty Editor area, Start page, or something else
        return false
    }

    // The built-in Settings UI tab typically has the label "Settings" (in English).
    return activeTab.label === 'Settings'
}

export function isUserEligibleForAutoeditsFeature(
    autoeditsFeatureFlagEnabled: boolean
): AutoeditsUserEligibilityInfo {
    // Always enable auto-edit when testing
    if (process.env.CODY_TESTING === 'true' || process.env.NODE_ENV === 'test') {
        return { isUserEligible: true }
    }

    // Users with autoedit feature flag enabled are eligible for auto-edit
    return {
        isUserEligible: autoeditsFeatureFlagEnabled,
        nonEligibilityReason: autoeditsFeatureFlagEnabled
            ? undefined
            : AUTOEDITS_NON_ELIGIBILITY_MESSAGES.FEATURE_FLAG_NOT_ELIGIBLE,
    }
}
