import * as vscode from 'vscode'

import type { Config, ContextProvider } from '../chat/ContextProvider'

import { DocumentCodeAction } from './document'
import { EditCodeAction } from './edit'
import { ExplainCodeAction } from './explain'
import { FixupCodeAction } from './fixup'
import { CommitMessageCodeAction } from './commit-message'
import type { ChatClient, Editor } from '@sourcegraph/cody-shared'

interface CodeActionProviderOptions {
    contextProvider: ContextProvider
    chatClient: ChatClient
    editor: Editor
}

export class CodeActionProvider implements vscode.Disposable {
    private configurationChangeListener: vscode.Disposable
    private actionProviders: vscode.Disposable[] = []

    constructor(private options: CodeActionProviderOptions) {
        this.registerCodeActions(options.contextProvider.config)
        this.configurationChangeListener = options.contextProvider.configurationChangeEvent.event(() => {
            this.registerCodeActions(options.contextProvider.config)
        })
    }

    private registerCodeActions(config: Omit<Config, 'codebase'>): void {
        vscode.Disposable.from(...this.actionProviders).dispose()
        this.actionProviders = []

        if (!config.codeActions) {
            return
        }

        this.actionProviders.push(
            vscode.languages.registerCodeActionsProvider('*', new EditCodeAction(), {
                providedCodeActionKinds: EditCodeAction.providedCodeActionKinds,
            }),
            vscode.languages.registerCodeActionsProvider('*', new DocumentCodeAction(), {
                providedCodeActionKinds: DocumentCodeAction.providedCodeActionKinds,
            }),
            vscode.languages.registerCodeActionsProvider('*', new ExplainCodeAction(), {
                providedCodeActionKinds: ExplainCodeAction.providedCodeActionKinds,
            }),
            vscode.languages.registerCodeActionsProvider('*', new FixupCodeAction(), {
                providedCodeActionKinds: FixupCodeAction.providedCodeActionKinds,
            }),
            vscode.languages.registerCodeActionsProvider(
                { scheme: 'vscode-scm' },
                new CommitMessageCodeAction({
                    chatClient: this.options.chatClient,
                    editor: this.options.editor,
                }),
                { providedCodeActionKinds: CommitMessageCodeAction.providedCodeActionKinds }
            )
        )
    }

    public dispose(): void {
        this.configurationChangeListener.dispose()
        vscode.Disposable.from(...this.actionProviders).dispose()
    }
}
