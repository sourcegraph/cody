import {
    type ChatClient,
    type ChatMessage,
    type CompletionGeneratorValue,
    type ContextItem,
    type Message,
    type ModelContextWindow,
    ModelProvider,
    ModelUsage,
    getDotComDefaultModels,
    getSimplePreamble,
    pluralize,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { PromptBuilder } from '../../prompt-builder'
import type { API, GitExtension, InputBox, Repository } from '../../repository/builtinGitExtension'
import type { AuthProvider } from '../../services/AuthProvider'
import { getContextFilesFromGitApi as getContext } from '../context/git-api'
import { commitPrompts } from './prompts'

export class CodySourceControl implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private gitAPI: API | undefined
    private abortController: AbortController | undefined
    private modelProvider = getDotComDefaultModels()[0]

    constructor(
        private readonly authProvider: AuthProvider,
        private readonly chatClient: ChatClient
    ) {
        // Register commands
        this.disposables.push(
            vscode.commands.registerCommand('cody.command.generate-commit', scm => this.generate(scm)),
            vscode.commands.registerCommand('cody.command.abort-commit', () => this.statusUpdate())
        )
        this.initializeGitAPI()
    }

    /**
     * Initialize and manage the git extension and API
     */
    private async initializeGitAPI() {
        const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
        await extension?.activate()
        this.gitAPI = extension?.exports?.getAPI(1)

        // React to enablement changes
        const onEnablementChange = extension?.exports?.onDidChangeEnablement(enabled => {
            this.gitAPI = enabled ? extension.exports.getAPI(1) : undefined
        })

        // React to configuration changes
        const onConfigChange = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('git.enabled')) {
                const gitConfig = vscode.workspace.getConfiguration('git')
                this.gitAPI = gitConfig.get<boolean>('enabled')
                    ? extension?.exports.getAPI(1)
                    : undefined
            }
        })

        // TODO update the model on AuthStatus change.
        const authStatus = this.authProvider.getAuthStatus()
        this.modelProvider =
            ModelProvider.getProviders(ModelUsage.Chat, !authStatus.userCanUpgrade)?.[0] ??
            this.modelProvider
        this.disposables.push(onConfigChange, onEnablementChange?.dispose())
    }

    /**
     * Generates a commit message based on the current git output.
     *
     * @param scm - The source control instance to use for the commit message generation.
     */
    public async generate(scm?: vscode.SourceControl): Promise<void> {
        telemetryRecorder.recordEvent('cody.command.commit', 'executed')

        const currentWorkspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        if (!this.gitAPI || !currentWorkspaceUri) {
            vscode.window.showInformationMessage('Git is not available in the current workspace.')
            return
        }

        if (this.abortController) {
            vscode.window.showInformationMessage('There is a commit message generation in progress.')
            return
        }

        const repository = this.gitAPI.getRepository(currentWorkspaceUri)
        const sourceControlInputbox = scm?.inputBox ?? repository?.inputBox
        if (!sourceControlInputbox || !repository) {
            vscode.window.showInformationMessage('Your source control provider is not supported.')
            return
        }

        // Stage all changes when there is unstaged changes only.
        const stagedChanges = repository?.state?.indexChanges?.length
        const unstagedChanges = repository?.state?.workingTreeChanges?.length
        !stagedChanges && unstagedChanges && (await vscode.commands.executeCommand('git.stageAll'))

        // Open the vscode source control view to show the progress.
        void vscode.commands.executeCommand('workbench.view.scm')
        // Focus the workbench view to show the progress.
        void vscode.commands.executeCommand('workbench.scm.focus')

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.SourceControl,
                title: 'Generating commit message...',
                cancellable: true,
            },
            async (progress, token) => {
                this.stream(repository, sourceControlInputbox, progress, token, scm?.commitTemplate)
            }
        )
    }

    private async stream(
        repository: Repository,
        sourceControlInputbox: vscode.SourceControlInputBox | InputBox,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        token: vscode.CancellationToken,
        commitTemplate?: string
    ): Promise<void> {
        // Update context status to indicate that Cody is generating a commit message.
        const abortController = new AbortController()
        this.statusUpdate(abortController)

        const initialInputBoxValue = sourceControlInputbox.value

        const generatingCommitTitle = 'Generating commit message...'
        const initialPlaceholder = (sourceControlInputbox as vscode.SourceControlInputBox).placeholder
        if (initialPlaceholder !== undefined) {
            sourceControlInputbox.value = ''
            ;(sourceControlInputbox as vscode.SourceControlInputBox).placeholder = generatingCommitTitle
        } else {
            sourceControlInputbox.value = generatingCommitTitle
        }

        progress.report({ message: generatingCommitTitle })
        try {
            token.onCancellationRequested(() => {
                progress.report({ message: 'Aborted' })
                this.statusUpdate()
            })

            const { model, contextWindow } = this.modelProvider
            const { prompt, ignoredContext } = await buildPrompt(
                contextWindow,
                getSimplePreamble(model, 1, commitPrompts.intro),
                await getContext(repository, commitTemplate).catch(() => [])
            ).catch(error => {
                sourceControlInputbox.value = `${error}`
                throw new Error()
            })

            const stream = this.chatClient.chat(
                prompt,
                { model, maxTokensToSample: contextWindow.output },
                abortController?.signal
            )

            // Function to update the input box with the latest text
            const updateInputBox = (text: string, hasStopped = false) => {
                sourceControlInputbox.value = text
                hasStopped && this.statusUpdate()
            }

            await streaming(stream, abortController, updateInputBox, progress)

            if (ignoredContext.length > 0) {
                vscode.window.showInformationMessage(
                    `Cody was forced to skip ${ignoredContext.length} ${pluralize(
                        'file',
                        ignoredContext.length,
                        'files'
                    )} when generating the commit message.`
                )
            }
        } catch (error) {
            this.statusUpdate()
            progress.report({ message: 'Error' })
            if (error instanceof Error && error.message) {
                sourceControlInputbox.value = initialInputBoxValue // Revert to initial value on error
                vscode.window.showInformationMessage(`Generate commit message failed: ${error.message}`)
            }
        } finally {
            if (initialPlaceholder !== undefined) {
                ;(sourceControlInputbox as vscode.SourceControlInputBox).placeholder = initialPlaceholder
            }
        }
    }

    /**
     * Updates the commit generation state and sets the corresponding context status.
     * If an `abortController` is provided, it is used to abort the current commit generation.
     *
     * @param abortController - An optional `AbortController` instance to use for aborting the current commit generation.
     */
    private statusUpdate(abortController?: AbortController): void {
        const isGenerating = abortController !== undefined
        const contextID = 'cody.isGeneratingCommit'
        vscode.commands.executeCommand('setContext', contextID, isGenerating)

        this.abortController?.abort()
        this.abortController = abortController
    }

    public dispose(): void {
        for (const disposable of [...this.disposables]) {
            disposable.dispose()
        }
        this.disposables = []
    }
}

async function buildPrompt(
    contextWindow: ModelContextWindow,
    preamble: Message[],
    context: ContextItem[]
): Promise<{ prompt: Message[]; ignoredContext: ContextItem[] }> {
    if (!context.length) {
        throw new Error('Failed to get git output.')
    }

    const transcript: ChatMessage[] = [{ speaker: 'human', text: commitPrompts.message }]
    const promptBuilder = new PromptBuilder(contextWindow)
    promptBuilder.tryAddToPrefix(preamble)
    promptBuilder.tryAddMessages(transcript.reverse())

    const { ignored: ignoredContext } = await promptBuilder.tryAddContext('user', context)

    return { prompt: promptBuilder.build(), ignoredContext }
}

async function streaming(
    stream: AsyncIterable<CompletionGeneratorValue>,
    abortController: AbortController,
    updateInputBox: (text: string, hasStopped?: boolean) => void,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    // Ensure commitText is defined outside the loop for scope retention
    let commitText = ''

    for await (const message of stream) {
        // Keep using the streamed value on abort.
        if (abortController.signal.aborted) {
            updateInputBox(commitText, true)
            break
        }

        // Update the input box value based on the message type.
        switch (message.type) {
            case 'change':
                commitText = message.text
                updateInputBox(message.text)
                break
            case 'complete':
                updateInputBox(commitText, true)
                progress.report({ message: 'Complete' })
                break
            case 'error':
                throw new Error(message?.error?.message)
        }
    }
}
