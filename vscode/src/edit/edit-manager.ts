import * as vscode from 'vscode'

import {
    type ChatClient,
    ClientConfigSingleton,
    DEFAULT_EVENT_SOURCE,
    type EditModel,
    type EventSource,
    firstResultFromOperation,
    modelsService,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import { isUriIgnoredByContextFilterWithNotification } from '../cody-ignore/context-filter'
import { type LastActiveTextEditor, getEditor } from '../editor/active-editor'
import type { VSCodeEditor } from '../editor/vscode-editor'
import type { CreateTaskOptions, FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'
import { ACTIVE_TASK_STATES } from '../non-stop/codelenses/constants'
import { splitSafeMetadata } from '../services/telemetry-v2'

import { EditLoggingFeatureFlagManager, getEditLoggingContext } from './edit-context-logging'
import type { ExecuteEditArguments } from './execute'
import { EditProvider } from './provider'
import { getEditIntent } from './utils/edit-intent'
import { getEditMode } from './utils/edit-mode'
import { getEditLineSelection, getEditSmartSelection } from './utils/edit-selection'

export interface EditManagerOptions {
    editor: VSCodeEditor
    fixupController: FixupController
    chatClient: ChatClient
}

// EditManager handles translating specific edit intents (document, edit) into
// generic FixupTasks, and pairs a FixupTask with an EditProvider to generate
// a completion.
export class EditManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private editProviders = new WeakMap<FixupTask, EditProvider>()

    public editLoggingFeatureFlagManager = new EditLoggingFeatureFlagManager()

    constructor(public options: EditManagerOptions) {
        /**
         * Entry point to triggering a new Edit.
         * Given a set or arguments, this will create a new LLM interaction
         * and start a `FixupTask`.
         */
        const editCommand = vscode.commands.registerCommand(
            'cody.command.edit-code',
            (args: ExecuteEditArguments) => this.executeEdit(args)
        )

        /**
         * Entry point to start an existing Edit.
         * This generally should only be required if a `FixupTask` needs
         * to be manually re-triggered in some way. For example, if we need
         * to restart a task due to a conflict.
         *
         * Note: This differs to a "retry", as it preserves the original `FixupTask`.
         */
        const startCommand = vscode.commands.registerCommand(
            'cody.command.start-edit',
            (task: FixupTask) => {
                const provider = this.getProviderForTask(task)
                provider.abortEdit()
                provider.startStreamingEdit()
            }
        )

        this.disposables.push(this.options.fixupController, editCommand, startCommand)
    }

    public getProviderForTask(task: FixupTask): EditProvider {
        let provider = this.editProviders.get(task)

        if (!provider) {
            provider = new EditProvider({ task, ...this.options })
            this.editProviders.set(task, provider)
        }

        return provider
    }

    public async getEditModel(config: { model?: EditModel }): Promise<EditModel> {
        const model =
            config.model || (await firstResultFromOperation(modelsService.getDefaultEditModel()))

        if (!model) {
            throw new Error('No default edit model found. Please set one.')
        }

        return model
    }

    public createTaskAndCheckForDuplicates(createTaskOptions: CreateTaskOptions): FixupTask | null {
        const task = this.options.fixupController.createTask(createTaskOptions)
        if (!task) {
            return null
        }

        /**
         * Checks if there is already an active task for the given fixup file
         * that has the same instruction and selection range as the current task.
         */
        const activeTask = this.options.fixupController.tasksForFile(task.fixupFile).find(activeTask => {
            return (
                ACTIVE_TASK_STATES.includes(activeTask.state) &&
                activeTask.instruction.toString() === task.instruction.toString() &&
                activeTask.selectionRange.isEqual(task.selectionRange)
            )
        })

        if (activeTask) {
            this.options.fixupController.cancel(task)
            return null
        }

        return task
    }

    public async createEditTask({
        configuration,
        source,
        telemetryMetadata,
    }: {
        configuration: NonNullable<ExecuteEditArguments['configuration']>
        source: EventSource
        telemetryMetadata?: any
    }): Promise<FixupTask | null> {
        const clientConfig = await ClientConfigSingleton.getInstance().getConfig()
        if (!clientConfig?.customCommandsEnabled) {
            void vscode.window.showErrorMessage(
                'This feature has been disabled by your Sourcegraph site admin.'
            )
            return null
        }

        const editor = getEditor()
        const document = configuration.document || editor.active?.document
        if (!document) {
            void vscode.window.showErrorMessage('Please open a file before running a command.')
            return null
        }

        if (await isUriIgnoredByContextFilterWithNotification(document.uri, 'edit')) {
            return null
        }

        const proposedRange = configuration.range || editor.active?.selection
        if (!proposedRange) {
            return null
        }

        // Set default edit configuration, if not provided
        // It is possible that these values may be overridden later,
        // e.g. if the user changes them in the edit input.
        const range = getEditLineSelection(document, proposedRange)
        const model = await this.getEditModel(configuration)
        const intent = getEditIntent(document, range, configuration.intent)
        const mode = getEditMode(intent, configuration.mode)

        let expandedRange: vscode.Range | undefined
        // Support expanding the selection range for intents where it is useful
        if (intent !== 'add') {
            const smartRange = await getEditSmartSelection(document, range, {}, intent)

            if (!smartRange.isEqual(range)) {
                expandedRange = smartRange
            }
        }

        if (configuration.instruction && configuration.instruction.trim().length > 0) {
            return this.createTaskAndCheckForDuplicates({
                document,
                instruction: configuration.instruction,
                userContextFiles: configuration.userContextFiles ?? [],
                selectionRange: expandedRange || range,
                intent,
                mode,
                model,
                rules: configuration.rules ?? null,
                source,
                destinationFile: configuration.destinationFile,
                insertionPoint: configuration.insertionPoint,
                telemetryMetadata,
                taskId: configuration.id,
            })
        }

        return await this.options.fixupController.promptUserForTask(
            configuration.preInstruction,
            document,
            range,
            expandedRange,
            mode,
            model,
            configuration.rules ?? null,
            intent,
            source,
            telemetryMetadata
        )
    }

    public async executeEdit(args: ExecuteEditArguments = {}): Promise<void> {
        const {
            configuration = {},
            /**
             * Note: Source must default to `editor` as these are
             * editor actions that cannot provide executeEdit `args`.
             * E.g. triggering this command via the command palette, right-click menus
             **/
            source = DEFAULT_EVENT_SOURCE,
            telemetryMetadata,
        } = args

        const task = await this.createEditTask({
            configuration,
            source,
            telemetryMetadata,
        })

        if (!task) {
            return
        }

        await this.startStreamingEditTask({ task })
    }

    public logExecutedTaskEvent(task: FixupTask): void {
        const { intent, telemetryMetadata, mode, source, document, selectionRange, model } = task

        const isDocCommand = intent === 'doc' ? 'doc' : undefined
        const isUnitTestCommand = intent === 'test' ? 'test' : undefined
        const isFixCommand = intent === 'fix' ? 'fix' : undefined
        const eventName = isDocCommand ?? isUnitTestCommand ?? isFixCommand ?? 'edit'

        const editContext = getEditLoggingContext({
            isFeatureFlagEnabledForLogging:
                this.editLoggingFeatureFlagManager.isEditContextDataCollectionFlagEnabled(),
            instruction: task.instruction.toString(),
            document,
            selectionRange,
        })

        const legacyMetadata = {
            intent,
            mode,
            source,
            ...telemetryMetadata,
            editContext,
        }
        const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)

        telemetryRecorder.recordEvent(`cody.command.${eventName}`, 'executed', {
            metadata: {
                ...metadata,
                recordsPrivateMetadataTranscript: editContext === undefined ? 0 : 1,
            },
            privateMetadata: {
                ...privateMetadata,
                model,
            },
            billingMetadata: {
                product: 'cody',
                category: 'core',
            },
        })
    }

    public async startStreamingEditTask({
        task,
        editor = getEditor(),
    }: { task: FixupTask; editor?: LastActiveTextEditor }): Promise<void> {
        /**
         * Updates the editor's selection and view for 'doc' or 'test' intents, causing the cursor to
         * move to the beginning of the selection range considered for the edit.
         */
        if (editor.active && (task.intent === 'doc' || task.intent === 'test')) {
            const newPosition = task.selectionRange.start
            editor.active.selection = new vscode.Selection(newPosition, newPosition)
            editor.active.revealRange(
                new vscode.Range(newPosition, newPosition),
                vscode.TextEditorRevealType.InCenter
            )
        }

        this.logExecutedTaskEvent(task)
        this.options.fixupController.startDecorator(task)
        const provider = this.getProviderForTask(task)
        await provider.startStreamingEdit()
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
