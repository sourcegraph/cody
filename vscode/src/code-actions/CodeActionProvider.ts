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
    private actionProviders: vscode.Disposable[] = []

    constructor(options: CodeActionProviderOptions) {
        this.registerCodeActions(options.contextProvider.config)
        this.configurationChangeListener = options.contextProvider.configurationChangeEvent.event(() => {
            this.registerCodeActions(options.contextProvider.config)
        })
    }

    private registerCodeActions(config: Omit<Config, 'codebase'>): void {
        this.actionProviders.forEach(provider => provider.dispose())
        this.actionProviders = []

        if (!config.codeActions) {
            return
        }

        this.addActionProvider(EditCodeAction)
        this.addActionProvider(DocumentCodeAction)
        this.addActionProvider(ExplainCodeAction)
        this.addActionProvider(FixupCodeAction)
    }

    private addActionProvider(ActionType: {
        new (): vscode.CodeActionProvider
        providedCodeActionKinds: vscode.CodeActionKind[]
    }): void {
        const provider = vscode.languages.registerCodeActionsProvider('*', new ActionType(), {
            providedCodeActionKinds: ActionType.providedCodeActionKinds,
        })
        this.actionProviders.push(provider)
    }

    public dispose(): void {
        this.configurationChangeListener.dispose()
        this.actionProviders.forEach(provider => provider.dispose())
    }
}
