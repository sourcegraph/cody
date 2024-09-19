import {
    type ChatClient,
    type ChatMessage,
    ModelUsage,
    PromptString,
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

const models = modelsService.getModels(ModelUsage.Chat)
const model = models.find(model => model.id === 'haiku')?.id ?? models[0]?.id ?? ''

const CODY_ACTION_CLI_PROMPT = ps`Generate a shell command for the following use case:
    <usecase>
    {input}
    </usecase>

    In your response, enclose the shell command that I can run in my terminal for my use case inside the <cody_shell></cody_shell> XML tags,
    with all placeholders values starting with $, and chain commands with &&. All shell commands must be executable without interaction if possible.

    For example:
    - If the use case is "remove a file from the current directory", respond with <cody_shell>rm $filename</cody_shell>.
    - If the use case is "list the files in the current directory and then remove the first file", respond with <cody_shell>ls && rm $filename</cody_shell>.

    Return empty string if no shell command is found. Skip preambles.`

class CodyCommandLine implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private terminal = vscode.window.createTerminal({
        name: 'Cody Command Line',
        hideFromUser: true,
        iconPath: new vscode.ThemeIcon('cody-logo-heavy'),
        isTransient: true,
    })

    constructor(private readonly chatClient: ChatClient) {
        this.registerTerminal()
        this.disposables.push(
            vscode.commands.registerCommand('cody.command.cody-cli', () => this.execute()),
            vscode.commands.registerCommand('cody.command.cody-cli-run', (command: string) =>
                this.run(command)
            )
        )
    }

    private registerTerminal(): void {
        this.terminal = vscode.window.createTerminal({
            name: 'Cody Command Line',
            hideFromUser: true,
            iconPath: new vscode.ThemeIcon('cody-logo-heavy'),
            isTransient: true,
        })
        this.disposables.push(this.terminal)
        // TODO: If the terminal was disposed, create a new one
    }

    public async execute(): Promise<void> {
        telemetryRecorder.recordEvent('cody.command.commit', 'executed')

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
            if (streamText.startsWith('<cody_shell>') && streamText.endsWith('</cody_shell>')) {
                shellCommand = streamText.slice(12, -13)
                quickPick.value = shellCommand
                quickPick.items = [
                    { key: -1, label: 'Cody response' },
                    {
                        label: shellCommand,
                        detail: `Command for ${input}`,
                        alwaysShow: true,
                    },
                    { label: 'Click to run command in Terminal' },
                    { label: 'Click to copy' },
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

            const selectedOption = quickPick.activeItems[0] as CodyCommandLineQuickPickItem
            if (selectedOption?.label === 'Click to copy') {
                await vscode.env.clipboard.writeText(shellCommand)
                vscode.window.showInformationMessage('Shell command copied to clipboard')
                return
            }

            this.run(shellCommand)
            this.terminal.show()

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

    public run(command: string): void {
        this.terminal.sendText(command)
        this.terminal.show()
    }

    // Get the output of the shell command
    public async getOutput(): Promise<string> {
        const currentClipboardContent = await vscode.env.clipboard.readText()
        let output = ''
        // Periodically check the clipboard for new output
        this.terminal.show()
        const interval = setInterval(async () => {
            await vscode.commands.executeCommand('workbench.action.terminal.copyLastCommandOutput')
            const text = await vscode.env.clipboard.readText()
            if (text === currentClipboardContent) {
                await vscode.env.clipboard.writeText(currentClipboardContent)
            }
            clearInterval(interval)
            await vscode.env.clipboard.writeText(currentClipboardContent)
            vscode.window.showInformationMessage('Terminal Output: ' + output)
            output = text
        }, 1000) // Check every second

        setTimeout(() => {
            clearInterval(interval)
        }, 20000) // Stop after 20 seconds

        return output
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
