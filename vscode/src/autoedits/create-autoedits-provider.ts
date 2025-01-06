import { type Observable, map } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type AuthenticatedAuthStatus,
    type ChatClient,
    NEVER,
    type UnauthenticatedAuthStatus,
    createDisposables,
    promiseFactoryToObservable,
} from '@sourcegraph/cody-shared'
import { AutoeditsProvider } from './autoedits-provider'
import { autoeditsOutputChannelLogger } from './output-channel-logger'

interface AutoeditsItemProviderArgs {
    authStatus: UnauthenticatedAuthStatus | Pick<AuthenticatedAuthStatus, 'authenticated' | 'endpoint'>
    chatClient: ChatClient
}

export function createAutoEditsProvider({
    authStatus,
    chatClient,
}: AutoeditsItemProviderArgs): Observable<void> {
    if (!authStatus.authenticated) {
        if (!authStatus.pendingValidation) {
            autoeditsOutputChannelLogger.logDebug('createProvider', 'You are not signed in.')
        }
        return NEVER
    }
    return promiseFactoryToObservable(async () => {
        return await getAutoeditsProviderDocumentFilters()
    }).pipe(
        createDisposables(documentFilters => {
            const provider = new AutoeditsProvider(chatClient)
            return [
                vscode.commands.registerCommand('cody.command.autoedits-manual-trigger', async () => {
                    await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
                    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
                }),
                vscode.languages.registerInlineCompletionItemProvider(documentFilters, provider),
                provider,
            ]
        }),
        map(() => undefined)
    )
}

export async function getAutoeditsProviderDocumentFilters(): Promise<vscode.DocumentFilter[]> {
    return [{ scheme: 'file', language: '*' }, { notebookType: '*' }]
}
