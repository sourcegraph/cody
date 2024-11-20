import { type PromptMode, graphqlClient } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ChatsController } from '../chat/chat-view/ChatsController'
import { createQuickPick } from '../edit/input/quick-pick'

export class PromptsManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private chatsController: ChatsController

    constructor(args: { chatsController: ChatsController }) {
        this.chatsController = args.chatsController

        const executePrompt = vscode.commands.registerCommand(
            'cody.command.execute-prompt',
            this.showPromptsQuickPick
        )
        this.disposables.push(executePrompt)
    }

    public showPromptsQuickPick = async (args: any): Promise<undefined> => {
        const getItems = async (query?: string) => {
            const prompts = await graphqlClient.queryPrompts({
                query: query || '',
                first: 10,
                recommendedOnly: false,
            })

            return {
                items: prompts.map(
                    prompt =>
                        ({
                            label: prompt.name,
                            detail: prompt.description,
                            value: JSON.stringify({
                                id: prompt.id,
                                text: prompt.definition.text,
                                mode: prompt.mode,
                                autoSubmit: prompt.autoSubmit,
                            }),
                        }) as vscode.QuickPickItem
                ),
            }
        }
        const quickPick = createQuickPick({
            title: 'Prompts',
            placeHolder: 'Search a prompt',
            getItems,
            onDidAccept: async item => {
                // execute prompt
                console.log(item)
                if (!item) {
                    return
                }

                const {
                    text,
                    mode,
                    autoSubmit,
                }: { text: string; mode: PromptMode; autoSubmit: boolean } = JSON.parse(
                    (item as unknown as { value: string }).value
                )

                this.chatsController.executePrompt({
                    text,
                    mode,
                    autoSubmit,
                })

                quickPick.hide()
            },
            onDidChangeValue: async query => {
                const { items } = await getItems(query)
                quickPick.setItems(items)
            },
        })

        quickPick.render('')
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
