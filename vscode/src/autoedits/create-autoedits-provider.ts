import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type AuthenticatedAuthStatus,
    type ChatClient,
    NEVER,
    type PickResolvedConfiguration,
    type UnauthenticatedAuthStatus,
    createDisposables,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'

import type { FixupController } from '../non-stop/FixupController'

import { AutoeditsProvider } from './autoedits-provider'
import { autoeditsOutputChannelLogger } from './output-channel-logger'

interface AutoeditsItemProviderArgs {
    config: PickResolvedConfiguration<{ configuration: true }>
    authStatus: UnauthenticatedAuthStatus | Pick<AuthenticatedAuthStatus, 'authenticated' | 'endpoint'>
    chatClient: ChatClient
    fixupController: FixupController
}

export function createAutoEditsProvider({
    config: { configuration },
    authStatus,
    chatClient,
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

    return Observable.of(undefined).pipe(
        skipPendingOperation(),
        createDisposables(() => {
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
