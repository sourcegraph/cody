import type { ChatClient, Guardrails } from '@sourcegraph/cody-shared'

import type { VSCodeEditor } from '../editor/vscode-editor'
import type { AuthProvider } from '../services/AuthProvider'

import type { SecretStorage } from '../services/SecretStorageProvider'
import type { ContextProvider } from './ContextProvider'

/**
 * The types of errors that should be handled from MessageProvider.
 * `transcript`: Errors that can be displayed directly within a chat transcript, if available.
 * `system`: Errors that should be handled differently, e.g. alerted to the user.
 */
export type MessageErrorType = 'transcript' | 'system'

export interface MessageProviderOptions {
    chat: ChatClient
    guardrails: Guardrails
    editor: VSCodeEditor
    secretStorage: SecretStorage
    authProvider: AuthProvider
    contextProvider: ContextProvider
}
