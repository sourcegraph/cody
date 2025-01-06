import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ChatClient,
    NEVER,
    type PickResolvedConfiguration,
    type UserProductSubscription,
    combineLatest,
    createDisposables,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'
import { isFreeUser } from '@sourcegraph/cody-shared/src/auth/types'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import { AutoeditsProvider } from './autoedits-provider'
import { autoeditsOutputChannelLogger } from './output-channel-logger'

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

    return Observable.of(undefined).pipe(
        skipPendingOperation(),
        createDisposables(() => {
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
