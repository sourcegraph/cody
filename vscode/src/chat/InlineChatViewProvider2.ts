import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'

import { VSCodeEditor } from '../editor/vscode-editor'
import { AuthProvider } from '../services/AuthProvider'
import { LocalStorage } from '../services/LocalStorageProvider'
import { SecretStorage } from '../services/SecretStorageProvider'

import { Config, MessageProvider } from './MessageProvider2'

export class InlineChatViewProvider extends MessageProvider {
    constructor(
        protected config: Omit<Config, 'codebase'>, // should use codebaseContext.getCodebase() rather than config.codebase
        protected chat: ChatClient,
        protected intentDetector: IntentDetector,
        protected codebaseContext: CodebaseContext,
        protected guardrails: Guardrails,
        protected editor: VSCodeEditor,
        protected secretStorage: SecretStorage,
        protected localStorage: LocalStorage,
        protected rgPath: string,
        protected authProvider: AuthProvider
    ) {
        super(
            config,
            chat,
            intentDetector,
            codebaseContext,
            guardrails,
            editor,
            secretStorage,
            localStorage,
            rgPath,
            authProvider,
            false
        )
    }

    /**
     * Send transcript to webview
     */
    protected sendTranscript2(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        const lastMessage = transcript[transcript.length - 1].displayText

        if (lastMessage) {
            this.editor.controllers.inline.reply(lastMessage, isMessageInProgress ? 'streaming' : 'complete')
        }
    }

    /**
     * Display error message in webview view as banner in chat view
     * It does not display error message as assistant response
     */
    protected sendError2(errorMsg: string): void {
        void this.editor.controllers.inline.error(errorMsg)
    }

    protected sendSuggestions2(): void {
        // not implemented
    }

    /**
     * Sends chat history to webview
     */
    protected sendHistory2(): void {
        // not implemented
    }

    protected async sendContextStatus2(): Promise<void> {
        // not implemented
    }

    protected async sendConfig2(): Promise<void> {
        // not implemented
    }
}
