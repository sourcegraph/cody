import { type Observable, map } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ChatClient,
    NEVER,
    type PickResolvedConfiguration,
    type UserProductSubscription,
    combineLatest,
    createDisposables,
    currentUserProductSubscription,
    promiseFactoryToObservable,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'
import { isFreeUser } from '@sourcegraph/cody-shared/src/auth/types'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import { AutoeditsProvider } from './autoedits-provider'
import { autoeditsOutputChannelLogger } from './output-channel-logger'

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
}

export function createAutoEditsProvider({
    config: { configuration },
    authStatus,
    chatClient,
    autoeditsFeatureFlagEnabled,
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
                if (userEligibilityInfo.nonEligibilityReason) {
                    vscode.window.showInformationMessage(userEligibilityInfo.nonEligibilityReason)
                }
                return []
            }

            const provider = new AutoeditsProvider(chatClient)
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

export function isUserEligibleForAutoeditsFeature(
    autoeditsFeatureFlagEnabled: boolean,
    authStatus: AuthStatus,
    productSubscription: UserProductSubscription | null
): AutoeditsUserEligibilityInfo {
    // Editors other than vscode are not eligible for auto-edits
    if (isRunningInsideAgent()) {
        return {
            isUserEligible: false,
            nonEligibilityReason: 'auto-edits is currently only supported in VS Code.',
        }
    }
    // Free users are not eligible for auto-edits
    if (isFreeUser(authStatus, productSubscription)) {
        return {
            isUserEligible: false,
            nonEligibilityReason: 'auto-edits requires Cody Pro subscription.',
        }
    }

    // Users with autoedits feature flag enabled are eligible for auto-edits
    return {
        isUserEligible: autoeditsFeatureFlagEnabled,
        nonEligibilityReason: autoeditsFeatureFlagEnabled
            ? undefined
            : 'auto-edits is an experimental feature and currently not enabled for your account. Please check back later.',
    }
}
