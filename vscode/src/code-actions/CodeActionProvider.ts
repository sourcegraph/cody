import * as vscode from 'vscode'

import { Config, ContextProvider } from '../chat/ContextProvider'

import { DocumentCodeAction } from './document'
import { EditCodeAction } from './edit'
import { ExplainCodeAction } from './explain'
import { FixupCodeAction } from './fixup'

interface CodeActionProviderOptions {
    contextProvider: ContextProvider
}

export class CodeActionProvider implements vscode.Disposable {
    private configurationChangeListener: vscode.Disposable
    private fixActionProvider: vscode.Disposable | null = null
    private explainActionProvider: vscode.Disposable | null = null
    private documentActionProvider: vscode.Disposable | null = null
    private editActionProvider: vscode.Disposable | null = null

    constructor(options: CodeActionProviderOptions) {
        this.configureCodeActions(options.contextProvider.config)
        this.configurationChangeListener = options.contextProvider.configurationChangeEvent.event(() => {
            this.configureCodeActions(options.contextProvider.config)
        })
    }

    private configureCodeActions(config: Omit<Config, 'codebase'>): void {
        // Disable the code action provider if currently enabled
        // if (!config.codeActions) {
        //     this.codeActionProvider?.dispose()
        //     this.codeActionProvider = null
        //     return
        // }

        // Code action provider already exists, skip re-registering
        if (!this.fixActionProvider) {
            this.fixActionProvider = vscode.languages.registerCodeActionsProvider('*', new FixupCodeAction(), {
                providedCodeActionKinds: FixupCodeAction.providedCodeActionKinds,
            })
        }

        if (!this.explainActionProvider) {
            this.explainActionProvider = vscode.languages.registerCodeActionsProvider('*', new ExplainCodeAction(), {
                providedCodeActionKinds: ExplainCodeAction.providedCodeActionKinds,
            })
        }

        if (!this.documentActionProvider) {
            this.documentActionProvider = vscode.languages.registerCodeActionsProvider('*', new DocumentCodeAction(), {
                providedCodeActionKinds: DocumentCodeAction.providedCodeActionKinds,
            })
        }

        if (!this.editActionProvider) {
            this.editActionProvider = vscode.languages.registerCodeActionsProvider('*', new EditCodeAction(), {
                providedCodeActionKinds: EditCodeAction.providedCodeActionKinds,
            })
        }
    }

    public dispose(): void {
        this.configurationChangeListener.dispose()
        this.fixActionProvider?.dispose()
        this.explainActionProvider?.dispose()
        this.documentActionProvider?.dispose()
    }
}
