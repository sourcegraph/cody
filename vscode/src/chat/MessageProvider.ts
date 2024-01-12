import { type ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { type Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { type IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'

import { type CommandsController } from '../commands/CommandsController'
import { type VSCodeEditor } from '../editor/vscode-editor'
import { type PlatformContext } from '../extension.common'
import { type AuthProvider } from '../services/AuthProvider'

import { type ContextProvider } from './ContextProvider'

/**
 * The types of errors that should be handled from MessageProvider.
 * `transcript`: Errors that can be displayed directly within a chat transcript, if available.
 * `system`: Errors that should be handled differently, e.g. alerted to the user.
 */
export type MessageErrorType = 'transcript' | 'system'

export interface MessageProviderOptions {
    chat: ChatClient
    intentDetector: IntentDetector
    guardrails: Guardrails
    editor: VSCodeEditor
    authProvider: AuthProvider
    contextProvider: ContextProvider
    platform: Pick<PlatformContext, 'recipes'>
    commandsController?: CommandsController
}
