import * as vscode from 'vscode'

import { Agent } from '@sourcegraph/cody-agent/src/agent'

import { ProvideInlineCompletionItemsTracer, SetProviderInlineCompletionItemsTracer } from './tracer'

export class AgentInlineCompletionItemProvider
    implements vscode.InlineCompletionItemProvider, SetProviderInlineCompletionItemsTracer
{
    private agent = new Agent()

    private initialize: Promise<void> = Promise.resolve()

    constructor(disposables: vscode.Disposable[]) {
        this.initialize = this.doInitialize(disposables)
    }

    private async doInitialize(disposables: vscode.Disposable[]): Promise<void> {
        await this.agent.request('initialize', {
            name: 'VS Code',
            version: 'TODO',
            workspaceRootUri: vscode.workspace.rootPath || 'TODO',
            workspaceRootPath: vscode.workspace.rootPath || 'TODO',
            capabilities: {
                chat: 'streaming',
                completions: 'enabled',
            },
            connectionConfiguration: {
                accessToken: 'YOLO',
                customHeaders: {},
                serverEndpoint: 'haha',
            },
        })
        this.agent.notify('initialized', null)
        disposables.push(
            vscode.workspace.onDidOpenTextDocument(textDocument =>
                this.agent.notify('textDocument/didOpen', {
                    filePath: textDocument.fileName,
                    content: textDocument.getText(),
                    selection:
                        vscode.window.activeTextEditor?.document.uri === textDocument.uri
                            ? vscode.window.activeTextEditor?.selection
                            : undefined,
                })
            )
        )
        disposables.push(
            vscode.workspace.onDidChangeTextDocument(event =>
                this.agent.notify('textDocument/didChange', {
                    filePath: event.document.fileName,
                    content: event.document.getText(),
                    selection:
                        vscode.window.activeTextEditor?.document.uri === event.document.uri
                            ? vscode.window.activeTextEditor?.selection
                            : undefined,
                })
            )
        )
        disposables.push(
            vscode.window.onDidChangeActiveTextEditor(
                editor =>
                    editor &&
                    this.agent.notify('textDocument/didClose', {
                        filePath: editor?.document.fileName,
                    })
            )
        )
        disposables.push(
            vscode.workspace.onDidCloseTextDocument(textDocument =>
                this.agent.notify('textDocument/didClose', {
                    filePath: textDocument.fileName,
                })
            )
        )
    }

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        await this.initialize
        throw new Error('Method not implemented.')
    }

    public setTracer(value: ProvideInlineCompletionItemsTracer | null): void {
        // this.config.tracer = value
    }
}
