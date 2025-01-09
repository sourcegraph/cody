import { type Observable, map } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ChatClient,
    CodyAutoSuggestionMode,
    NEVER,
    type PickResolvedConfiguration,
    type UserProductSubscription,
    combineLatest,
    createDisposables,
    currentUserProductSubscription,
    isFreeUser,
    promiseFactoryToObservable,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { FixupController } from '../non-stop/FixupController'

import { AutoeditsProvider } from './autoedits-provider'
import { autoeditsOutputChannelLogger } from './output-channel-logger'

const AUTOEDITS_NON_ELIGIBILITY_MESSAGES = {
    ONLY_VSCODE_SUPPORT: 'Auto-Edits is currently only supported in VS Code.',
    PRO_USER_ONLY: 'Auto-Edits requires Cody Pro subscription.',
    FEATURE_FLAG_NOT_ELIGIBLE:
        'Auto-Edits is an experimental feature and currently not enabled for your account. Please check back later.',
}

/**
 * Information about a user's eligibility for auto-edits functionality.
 */
export interface AutoeditsUserEligibilityInfo {
    /**
     * Whether the user is eligible to use auto-edits.
     */
    isUserEligible: boolean

    /**
     * The reason why the user is not eligible for auto-edits, if applicable.
     * The message can be shown to the user, why auto-edits are not available to them.
     */
    nonEligibilityReason?: string
}

interface AutoeditsItemProviderArgs {
    config: PickResolvedConfiguration<{ configuration: true }>
    authStatus: AuthStatus
    chatClient: ChatClient
    autoeditsFeatureFlagEnabled: boolean
    fixupController: FixupController
}

export function createAutoEditsProvider({
    config: { configuration },
    authStatus,
    chatClient,
    autoeditsFeatureFlagEnabled,
    fixupController,
}: AutoeditsItemProviderArgs): Observable<void> {
    if (!configuration.experimentalAutoeditsEnabled) {
        return NEVER
    }

    if (!authStatus.authenticated) {
        if (!authStatus.pendingValidation) {
            autoeditsOutputChannelLogger.logDebug('createProvider', 'You are not signed in.')
        }
        return NEVER
    }

    return combineLatest(
        promiseFactoryToObservable(async () => await currentUserProductSubscription())
    ).pipe(
        skipPendingOperation(),
        createDisposables(([userProductSubscription]) => {
            const userEligibilityInfo = isUserEligibleForAutoeditsFeature(
                autoeditsFeatureFlagEnabled,
                authStatus,
                userProductSubscription
            )
            if (!userEligibilityInfo.isUserEligible) {
                handleAutoeditsNotificationForNonEligibleUser(userEligibilityInfo.nonEligibilityReason)
                return []
            }

            const provider = new AutoeditsProvider(chatClient, fixupController)
            return [
                vscode.commands.registerCommand('cody.command.autoedits-manual-trigger', async () => {
                    await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
                    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
                }),
                vscode.languages.registerInlineCompletionItemProvider(
                    [{ scheme: 'file', language: '*' }, { notebookType: '*' }],
                    provider
                ),
                provider,
            ]
        }),
        map(() => undefined)
    )
}

export async function handleAutoeditsNotificationForNonEligibleUser(
    nonEligibilityReason?: string
): Promise<void> {
    const switchToAutocompleteText = 'Switch to autocomplete'

    const selection = await vscode.window.showErrorMessage(
        `Error: ${nonEligibilityReason ?? AUTOEDITS_NON_ELIGIBILITY_MESSAGES.FEATURE_FLAG_NOT_ELIGIBLE}`,
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

export function isUserEligibleForAutoeditsFeature(
    autoeditsFeatureFlagEnabled: boolean,
    authStatus: AuthStatus,
    productSubscription: UserProductSubscription | null
): AutoeditsUserEligibilityInfo {
    // Editors other than vscode are not eligible for auto-edits
    if (isRunningInsideAgent()) {
        return {
            isUserEligible: false,
            nonEligibilityReason: AUTOEDITS_NON_ELIGIBILITY_MESSAGES.ONLY_VSCODE_SUPPORT,
        }
    }
    // Free users are not eligible for auto-edits
    if (isFreeUser(authStatus, productSubscription)) {
        return {
            isUserEligible: false,
            nonEligibilityReason: AUTOEDITS_NON_ELIGIBILITY_MESSAGES.PRO_USER_ONLY,
        }
    }

    // Users with autoedits feature flag enabled are eligible for auto-edits
    return {
        isUserEligible: autoeditsFeatureFlagEnabled,
        nonEligibilityReason: autoeditsFeatureFlagEnabled
            ? undefined
            : AUTOEDITS_NON_ELIGIBILITY_MESSAGES.FEATURE_FLAG_NOT_ELIGIBLE,
    }
}
