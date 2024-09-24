import {
    type ChatClient,
    type ChatMessage,
    ModelUsage,
    PromptString,
    firstResultFromOperation,
    getSimplePreamble,
    modelsService,
    ps,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { PromptBuilder } from '../../prompt-builder'

interface CodyCommandLineQuickPickItem extends vscode.QuickPickItem {
    onSelect: () => Promise<void>
}

const cmdTags = { open: '<CODYCLI>', close: '</CODYCLI>' }

const CODY_ACTION_CLI_PROMPT = ps`Generate a shell command for the following use case:
    <usecase>
    {input}
    </usecase>

    In your response, enclose the shell command that I can run in my terminal for my use case inside the <CODYCLI></CODYCLI> XML tags,
    with all placeholders values starting with $, and chain commands with &&. All shell commands must be executable without interaction if possible.

    For example:
    - If the use case is "remove a file from the current directory", respond with <CODYCLI>rm $filename</CODYCLI>.
    - If the use case is "list the files in the current directory and then remove the first file", respond with <CODYCLI>ls && rm $filename</CODYCLI>.

    Return empty string if no shell command is found. Skip preambles.`

class CodyCommandLine implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private terminal: vscode.Terminal

    constructor(private readonly chatClient: ChatClient) {
        this.terminal = this.getRegisteredTerminal()
        this.disposables.push(
            vscode.commands.registerCommand('cody.command.cody-cli', () => this.open()),
            vscode.commands.registerCommand('cody.command.cody-cli-run', (command: string) =>
                this.run(command)
            )
        )
    }

    private getRegisteredTerminal(): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name: 'Cody Command Line',
            hideFromUser: true,
            iconPath: new vscode.ThemeIcon('cody-logo-heavy'),
            isTransient: true,
        })
        this.disposables.push(terminal)
        return terminal
    }

    private async open(): Promise<void> {
        telemetryRecorder.recordEvent('cody.command.commit', 'executed')
        const models = await firstResultFromOperation(modelsService.getModels(ModelUsage.Chat))
        const model = models.find(model => model.id === 'haiku')?.id ?? models[0]?.id ?? ''
        const input = await vscode.window.showInputBox({
            title: 'Cody Command Line',
            placeHolder: 'e.g., Revert the current branch to match the latest commit on origin/main.',
            prompt: 'Tell Cody your task, and Cody will generate the necessary shell command to execute it.',
            valueSelection: [0, 1],
        })
        if (!input || !model) {
            return
        }
        const inputPromptString = PromptString.unsafe_fromUserQuery(input)
        const text = CODY_ACTION_CLI_PROMPT.replace('{input}', inputPromptString)

        const transcript: ChatMessage[] = [{ speaker: 'human', text }]
        const contextWindow = modelsService.getContextWindowByID(model)
        const promptBuilder = await PromptBuilder.create(contextWindow)
        promptBuilder.tryAddToPrefix(getSimplePreamble(model, 1, 'Default'))
        promptBuilder.tryAddMessages(transcript.reverse())

        const messages = promptBuilder.build()

        const abortController = new AbortController()

        const stream = this.chatClient.chat(
            messages,
            { model, maxTokensToSample: contextWindow.output },
            abortController.signal
        )

        const quickPick = vscode.window.createQuickPick()
        quickPick.busy = true
        quickPick.placeholder = 'Waiting...'
        quickPick.title = 'Asking Cody...'
        quickPick.items = []
        quickPick.ignoreFocusOut = false
        quickPick.show()
        quickPick.onDidHide(() => {
            abortController.abort()
        })

        let streamText = ''
        let shellCommand = ''

        const update = () => {
            if (streamText.startsWith(cmdTags.open) && streamText.endsWith(cmdTags.close)) {
                shellCommand = streamText.slice(cmdTags.open.length, 0 - cmdTags.close.length)
                quickPick.value = shellCommand
                quickPick.items = [
                    { key: -1, label: 'Cody response' },
                    {
                        label: shellCommand,
                        detail: `Command for ${input}`,
                        alwaysShow: true,
                    },
                    { label: 'Click to run command in Terminal' },
                ] as CodyCommandLineQuickPickItem[]
            }
        }

        quickPick.onDidChangeValue(async value => {
            shellCommand = value
        })

        quickPick.onDidAccept(async () => {
            if (!shellCommand) {
                return
            }
            this.run(shellCommand)
            quickPick.hide()
        })

        async function processStream() {
            for await (const message of stream) {
                switch (message.type) {
                    case 'change': {
                        streamText = message.text
                        break
                    }
                    case 'complete': {
                        update()
                        quickPick.busy = false
                        break
                    }
                    case 'error': {
                        quickPick.placeholder = 'Error'
                        console.log('streamText error', streamText)
                        quickPick.busy = false
                        break
                    }
                }
            }
        }

        await processStream()
    }

    private run(command: string): void {
        // TODO: If the terminal was disposed, create a new one
        this.terminal.sendText(command)
        this.terminal.show()
    }

    public dispose(): void {
        for (const disposable of [...this.disposables]) {
            disposable.dispose()
        }
        this.disposables = []
    }
}

export let codyCommandLine: CodyCommandLine | undefined = undefined

// Create and register the command
export function registerCodyCommandLine(chatClient: ChatClient): CodyCommandLine {
    codyCommandLine = new CodyCommandLine(chatClient)
    return codyCommandLine
}
