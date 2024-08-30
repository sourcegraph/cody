import {
    type AuthStatus,
    type ChatClient,
    type ChatMessage,
    type CompletionGeneratorValue,
    type ContextItem,
    type Message,
    type Model,
    type ModelContextWindow,
    ModelUsage,
    Typewriter,
    getDotComDefaultModels,
    getSimplePreamble,
    modelsService,
    pluralize,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { PromptBuilder } from '../../prompt-builder'
import type { API, GitExtension, InputBox, Repository } from '../../repository/builtinGitExtension'
import { getContextFilesFromGitApi as getContext } from '../context/git-api'
import { COMMIT_COMMAND_PROMPTS } from './prompts'

export class CodySourceControl implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private gitAPI: API | undefined
    private abortController: AbortController | undefined
    private model: Model = getDotComDefaultModels()[0]

    private commitTemplate?: string

    constructor(private readonly chatClient: ChatClient) {
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

        this.disposables.push(onConfigChange, onEnablementChange?.dispose())
    }

    /**
     * Generates a commit message based on the current git output.
     *
     * @param scm - The source control instance to use for the commit message generation.
     */
    public async generate(scm?: vscode.SourceControl): Promise<void> {
        telemetryRecorder.recordEvent('cody.command.generate-commit', 'executed')

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

        // Get Commit Template from config and set it when available.
        if (!this.commitTemplate) {
            const [localTemplate, globalTemplate] = await Promise.all([
                repository.getConfig('commit.template'),
                repository.getGlobalConfig('commit.template'),
            ])

            this.commitTemplate = scm?.commitTemplate ?? localTemplate ?? globalTemplate
        }

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
        const initialPlaceholder = (sourceControlInputbox as vscode.SourceControlInputBox).placeholder

        const generatingCommitTitle = 'Generating commit message...'
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

            const { id: model, contextWindow } = this.model
            const { prompt, ignoredContext } = await this.buildPrompt(
                contextWindow,
                getSimplePreamble(model, 1, 'Default', COMMIT_COMMAND_PROMPTS.intro),
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

    private async buildPrompt(
        contextWindow: ModelContextWindow,
        preamble: Message[],
        context: ContextItem[]
    ): Promise<{ prompt: Message[]; ignoredContext: ContextItem[] }> {
        if (!context.length) {
            throw new Error('Failed to get git output.')
        }

        const templatePrompt = this.commitTemplate
            ? COMMIT_COMMAND_PROMPTS.template
            : COMMIT_COMMAND_PROMPTS.noTemplate
        const text = COMMIT_COMMAND_PROMPTS.instruction.replace('{COMMIT_TEMPLATE}', templatePrompt)
        const transcript: ChatMessage[] = [{ speaker: 'human', text }]

        const promptBuilder = await PromptBuilder.create(contextWindow)
        promptBuilder.tryAddToPrefix(preamble)
        promptBuilder.tryAddMessages(transcript.reverse())

        const { ignored: ignoredContext } = await promptBuilder.tryAddContext('user', context)
        return { prompt: promptBuilder.build(), ignoredContext }
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

    public setAuthStatus(_: AuthStatus): void {
        const models = modelsService.instance!.getModels(ModelUsage.Chat)
        const preferredModel = models.find(p => p.id.includes('claude-3-haiku'))
        this.model = preferredModel ?? models[0]
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            if (disposable) {
                disposable.dispose()
            }
        }
        this.disposables = []
    }
}

async function streaming(
    stream: AsyncIterable<CompletionGeneratorValue>,
    abortController: AbortController,
    updateInputBox: (text: string, hasStopped?: boolean) => void,
    progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    // Ensure commitText is defined outside the loop for scope retention
    let commitText = ''
    const typewriter = new Typewriter({
        update(content): void {
            updateInputBox(content)
        },
        close() {
            updateInputBox(commitText, true)
        },
    })

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
                typewriter.update(commitText)
                break
            case 'complete':
                typewriter.close()
                progress.report({ message: 'Complete' })
                break
            case 'error':
                typewriter.close()
                throw new Error(message?.error?.message)
        }
    }
}
