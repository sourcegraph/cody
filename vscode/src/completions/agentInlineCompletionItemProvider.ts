import * as vscode from 'vscode'

import { Agent } from '@sourcegraph/cody-agent/src/agent'

import { ContextProvider } from '../chat/ContextProvider'

import * as CompletionLogger from './logger'
import { ProviderConfig } from './providers/provider'
import { ProvideInlineCompletionItemsTracer, SetProviderInlineCompletionItemsTracer } from './tracer'

export class AgentInlineCompletionItemProvider
    implements vscode.InlineCompletionItemProvider, SetProviderInlineCompletionItemsTracer
{
    private agent = new Agent().clientForThisInstance()

    private initialize: Promise<void> = Promise.resolve()

    constructor(
        disposables: vscode.Disposable[],
        contextProvider: ContextProvider,
        private readonly providerConfig: ProviderConfig
    ) {
        this.initialize = this.doInitialize(disposables, contextProvider)
    }

    private async doInitialize(disposables: vscode.Disposable[], contextProvider: ContextProvider): Promise<void> {
        await this.agent.request('initialize', {
            name: 'VS Code',
            version: 'TODO',
            workspaceRootUri: contextProvider.currentWorkspaceRoot,
            workspaceRootPath: contextProvider.currentWorkspaceRoot,
            capabilities: {
                chat: 'streaming',
                completions: 'enabled',
            },
            connectionConfiguration: {
                accessToken: contextProvider.config.accessToken || '',
                serverEndpoint: contextProvider.config.serverEndpoint,
                customHeaders: contextProvider.config.customHeaders,
            },
        })
        this.agent.notify('initialized', null)

        disposables.push(
            contextProvider.configurationChangeEvent.event(config =>
                this.agent.notify('connectionConfiguration/didChange', {
                    accessToken: contextProvider.config.accessToken || '',
                    serverEndpoint: contextProvider.config.serverEndpoint,
                    customHeaders: contextProvider.config.customHeaders,
                })
            )
        )

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
        CompletionLogger.clear()
        const logId = CompletionLogger.create({
            multiline: false, // TODO
            providerIdentifier: this.providerConfig.identifier,
            languageId: document.languageId,
        })
        const result = await this.agent.request('autocomplete/execute', {
            filePath: document.fileName,
            context: { triggerKind: 'automatic' },
            position,
            languageId: document.languageId,
            multiline: false,
        })
        return result.items.map(
            item =>
                new vscode.InlineCompletionItem(
                    item.insertText,
                    new vscode.Range(
                        new vscode.Position(item.range.start.line, item.range.start.character),
                        new vscode.Position(item.range.end.line, item.range.end.character)
                    ),
                    {
                        title: 'Completion accepted',
                        command: 'cody.autocomplete.inline.accepted',
                        arguments: [{ codyLogId: logId, codyLines: item.insertText.split(/\r\n|\r|\n/).length }],
                    }
                )
        )
    }

    public setTracer(value: ProvideInlineCompletionItemsTracer | null): void {
        // this.config.tracer = value
    }
}
