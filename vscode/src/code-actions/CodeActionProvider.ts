import * as vscode from 'vscode'

import type { ClientConfiguration } from '@sourcegraph/cody-shared'
import { getConfiguration } from '../configuration'
import { DocumentCodeAction } from './document'
import { EditCodeAction } from './edit'
import { ExplainCodeAction } from './explain'
import { FixupCodeAction } from './fixup'
import { TestCodeAction } from './test'

export class CodeActionProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private actionProviders: vscode.Disposable[] = []

    constructor() {
        this.registerCodeActions(getConfiguration())
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                this.registerCodeActions(getConfiguration())
            })
        )
    }

    private registerCodeActions(config: Omit<ClientConfiguration, 'codebase'>): void {
        for (const disposable of this.actionProviders) {
            disposable.dispose()
        }
        this.actionProviders = []

        if (!config.codeActions) {
            return
        }

        this.addActionProvider(TestCodeAction)
        this.addActionProvider(DocumentCodeAction)
        this.addActionProvider(EditCodeAction)
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
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        for (const disposable of this.actionProviders) {
            disposable.dispose()
        }
    }
}
