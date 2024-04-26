import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ChatClient,
    ConfigFeaturesSingleton,
    type ModelProvider,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import type { GhostHintDecorator } from '../commands/GhostHintDecorator'
import { getEditor } from '../editor/active-editor'
import type { VSCodeEditor } from '../editor/vscode-editor'
import { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'

import { DEFAULT_EVENT_SOURCE } from '@sourcegraph/cody-shared'
import type { ExtensionClient } from '../extension-client'
import { editModel } from '../models'
import { ACTIVE_TASK_STATES } from '../non-stop/codelenses/constants'
import type { AuthProvider } from '../services/AuthProvider'
import { telemetryService } from '../services/telemetry'
import { splitSafeMetadata } from '../services/telemetry-v2'
import { DEFAULT_EDIT_MODE } from './constants'
import type { ExecuteEditArguments } from './execute'
import { EditProvider } from './provider'
import { getEditIntent } from './utils/edit-intent'
import { getEditModelsForUser } from './utils/edit-models'
import { getEditLineSelection, getEditSmartSelection } from './utils/edit-selection'

export interface EditManagerOptions {
    editor: VSCodeEditor
    chat: ChatClient
    ghostHintDecorator: GhostHintDecorator
    authProvider: AuthProvider
    extensionClient: ExtensionClient
}

// EditManager handles translating specific edit intents (document, edit) into
// generic FixupTasks, and pairs a FixupTask with an EditProvider to generate
// a completion.
export class EditManager implements vscode.Disposable {
    private readonly controller: FixupController
    private disposables: vscode.Disposable[] = []
    private editProviders = new WeakMap<FixupTask, EditProvider>()
    private models: ModelProvider[] = []

    constructor(public options: EditManagerOptions) {
        this.controller = new FixupController(options.authProvider, options.extensionClient)
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
                provider.startEdit()
            }
        )
        this.disposables.push(this.controller, editCommand, startCommand)
    }

    public syncAuthStatus(authStatus: AuthStatus): void {
        this.models = getEditModelsForUser(authStatus)
    }

    public async executeEdit(args: ExecuteEditArguments = {}): Promise<FixupTask | undefined> {
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
        const configFeatures = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
        if (!configFeatures.commands) {
            void vscode.window.showErrorMessage(
                'This feature has been disabled by your Sourcegraph site admin.'
            )
            return
        }

        const editor = getEditor()
        if (editor.ignored) {
            void vscode.window.showInformationMessage('Cannot edit Cody ignored file.')
            return
        }

        const document = configuration.document || editor.active?.document
        if (!document) {
            void vscode.window.showErrorMessage('Please open a file before running a command.')
            return
        }

        const proposedRange = configuration.range || editor.active?.selection
        if (!proposedRange) {
            return
        }

        // Set default edit configuration, if not provided
        // It is possible that these values may be overriden later, e.g. if the user changes them in the edit input.
        const range = getEditLineSelection(document, proposedRange)
        const mode = configuration.mode || DEFAULT_EDIT_MODE
        const model = configuration.model || editModel.get(this.options.authProvider, this.models)
        const intent = getEditIntent(document, range, configuration.intent)

        let expandedRange: vscode.Range | undefined
        // Support expanding the selection range for intents where it is useful
        if (intent !== 'add') {
            const smartRange = await getEditSmartSelection(document, range, {}, intent)

            if (!smartRange.isEqual(range)) {
                expandedRange = smartRange
            }
        }

        let task: FixupTask | null
        if (configuration.instruction && configuration.instruction.trim().length > 0) {
            task = await this.controller.createTask(
                document,
                configuration.instruction,
                configuration.userContextFiles ?? [],
                expandedRange || range,
                intent,
                mode,
                model,
                source,
                configuration.destinationFile,
                configuration.insertionPoint,
                telemetryMetadata
            )
        } else {
            task = await this.controller.promptUserForTask(
                document,
                range,
                expandedRange,
                mode,
                model,
                intent,
                source,
                telemetryMetadata
            )
        }

        if (!task) {
            return
        }

        /**
         * Checks if there is already an active task for the given fixup file
         * that has the same instruction and selection range as the current task.
         */
        const activeTask = this.controller.tasksForFile(task.fixupFile).find(activeTask => {
            return (
                ACTIVE_TASK_STATES.includes(activeTask.state) &&
                activeTask.instruction === task!.instruction &&
                activeTask.selectionRange.isEqual(task!.selectionRange)
            )
        })

        if (activeTask) {
            this.controller.cancel(task)
            return
        }

        // Log the default edit command name for doc intent or test mode
        const isDocCommand = configuration.intent === 'doc' ? 'doc' : undefined
        const isUnitTestCommand = configuration.intent === 'test' ? 'test' : undefined
        const isFixCommand = configuration.intent === 'fix' ? 'fix' : undefined
        const eventName = isDocCommand ?? isUnitTestCommand ?? isFixCommand ?? 'edit'

        const legacyMetadata = {
            intent: task.intent,
            mode: task.mode,
            source: task.source,
            ...telemetryMetadata,
        }
        telemetryService.log(`CodyVSCodeExtension:command:${eventName}:executed`, legacyMetadata, {
            hasV2Event: true,
        })
        const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
        telemetryRecorder.recordEvent(`cody.command.${eventName}`, 'executed', {
            metadata,
            privateMetadata: {
                ...privateMetadata,
                model: task.model,
            },
        })

        const provider = this.getProviderForTask(task)
        await provider.startEdit()
        return task
    }

    private getProviderForTask(task: FixupTask): EditProvider {
        let provider = this.editProviders.get(task)
        if (!provider) {
            provider = new EditProvider({ task, controller: this.controller, ...this.options })
            this.editProviders.set(task, provider)
        }

        return provider
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
