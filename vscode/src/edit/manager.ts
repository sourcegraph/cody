import * as vscode from 'vscode'

import {
    type ChatClient,
    ClientConfigSingleton,
    PromptString,
    isCodyIgnoredFile,
    modelsService,
    ps,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import type { GhostHintDecorator } from '../commands/GhostHintDecorator'
import { getEditor } from '../editor/active-editor'
import type { VSCodeEditor } from '../editor/vscode-editor'
import { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'

import { DEFAULT_EVENT_SOURCE } from '@sourcegraph/cody-shared'
import { isUriIgnoredByContextFilterWithNotification } from '../cody-ignore/context-filter'
import { showCodyIgnoreNotification } from '../cody-ignore/notification'
import type { ExtensionClient } from '../extension-client'
import { ACTIVE_TASK_STATES } from '../non-stop/codelenses/constants'
import { authProvider } from '../services/AuthProvider'
import { splitSafeMetadata } from '../services/telemetry-v2'
import type { ExecuteEditArguments } from './execute'
import { SMART_APPLY_FILE_DECORATION, getSmartApplySelection } from './prompt/smart-apply'
import { EditProvider } from './provider'
import type { SmartApplyArguments } from './smart-apply'
import { getEditIntent } from './utils/edit-intent'
import { getEditMode } from './utils/edit-mode'
import { getEditLineSelection, getEditSmartSelection } from './utils/edit-selection'

export interface EditManagerOptions {
    editor: VSCodeEditor
    chat: ChatClient
    ghostHintDecorator: GhostHintDecorator
    extensionClient: ExtensionClient
}

// EditManager handles translating specific edit intents (document, edit) into
// generic FixupTasks, and pairs a FixupTask with an EditProvider to generate
// a completion.
export class EditManager implements vscode.Disposable {
    private readonly controller: FixupController
    private disposables: vscode.Disposable[] = []
    private editProviders = new WeakMap<FixupTask, EditProvider>()

    constructor(public options: EditManagerOptions) {
        this.controller = new FixupController(options.extensionClient)
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
         * Entry point to triggering a new Edit from a _known_ result.
         * Given a result and a given file, this will create a new LLM interaction,
         * determine the correct selection and start a `FixupTask`.
         */
        const smartApplyCommand = vscode.commands.registerCommand(
            'cody.command.smart-apply',
            (args: SmartApplyArguments) => this.smartApplyEdit(args)
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
        this.disposables.push(this.controller, editCommand, smartApplyCommand, startCommand)
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
        const clientConfig = await ClientConfigSingleton.getInstance().getConfig()
        if (!clientConfig?.customCommandsEnabled) {
            void vscode.window.showErrorMessage(
                'This feature has been disabled by your Sourcegraph site admin.'
            )
            return
        }

        const editor = getEditor()
        if (editor.ignored) {
            showCodyIgnoreNotification('edit', 'cody-ignore')
            return
        }

        const document = configuration.document || editor.active?.document
        if (!document) {
            void vscode.window.showErrorMessage('Please open a file before running a command.')
            return
        }

        if (await isUriIgnoredByContextFilterWithNotification(document.uri, 'edit')) {
            return
        }

        const proposedRange = configuration.range || editor.active?.selection
        if (!proposedRange) {
            return
        }

        // Set default edit configuration, if not provided
        // It is possible that these values may be overriden later, e.g. if the user changes them in the edit input.
        const range = getEditLineSelection(document, proposedRange)
        const model = configuration.model || modelsService.instance!.getDefaultEditModel()
        if (!model) {
            throw new Error('No default edit model found. Please set one.')
        }
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
                telemetryMetadata,
                configuration.id
            )
        } else {
            task = await this.controller.promptUserForTask(
                configuration.preInstruction,
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
                activeTask.instruction.toString() === task.instruction.toString() &&
                activeTask.selectionRange.isEqual(task.selectionRange)
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

    public async smartApplyEdit(args: SmartApplyArguments = {}): Promise<FixupTask | undefined> {
        const { configuration, source = 'chat' } = args
        if (!configuration) {
            return
        }

        const document = configuration.document
        if (isCodyIgnoredFile(document.uri)) {
            showCodyIgnoreNotification('edit', 'cody-ignore')
        }

        if (await isUriIgnoredByContextFilterWithNotification(document.uri, 'edit')) {
            return
        }

        const model = configuration.model || modelsService.instance!.getDefaultEditModel()
        if (!model) {
            throw new Error('No default edit model found. Please set one.')
        }

        telemetryRecorder.recordEvent('cody.command.smart-apply', 'executed')

        const editor = await vscode.window.showTextDocument(document.uri)

        if (args.configuration?.isNewFile) {
            // We are creating a new file, this means we are only _adding_ new code and _inserting_ it into the document.
            // We do not need to re-prompt the LLM for this, let's just add the code directly.
            const task = await this.controller.createTask(
                document,
                configuration.instruction,
                [],
                new vscode.Range(0, 0, 0, 0),
                'add',
                'insert',
                model,
                source,
                configuration.document.uri,
                undefined,
                {},
                configuration.id
            )

            const legacyMetadata = {
                intent: task.intent,
                mode: task.mode,
                source: task.source,
            }
            const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
            telemetryRecorder.recordEvent('cody.command.edit', 'executed', {
                metadata,
                privateMetadata: {
                    ...privateMetadata,
                    model: task.model,
                },
            })

            const provider = this.getProviderForTask(task)
            await provider.applyEdit(configuration.replacement)
            return task
        }

        // Apply some decorations to the editor, this showcases that Cody is working on the full file range
        // of the document. We will narrow it down to a selection soon.
        const documentRange = new vscode.Range(0, 0, document.lineCount, 0)
        editor.setDecorations(SMART_APPLY_FILE_DECORATION, [documentRange])

        // We need to extract the proposed code, provided by the LLM, so we can use it in future
        // queries to ask the LLM to generate a selection, and then ultimately apply the edit.
        const replacementCode = PromptString.unsafe_fromLLMResponse(configuration.replacement)

        const selection = await getSmartApplySelection(
            configuration.id,
            configuration.instruction,
            replacementCode,
            configuration.document,
            model,
            this.options.chat,
            authProvider.instance!.getAuthStatus().codyApiVersion
        )

        // We finished prompting the LLM for the selection, we can now remove the "progress" decoration
        // that indicated we where working on the full file.
        editor.setDecorations(SMART_APPLY_FILE_DECORATION, [])

        if (!selection) {
            // We couldn't figure out the selection, let's inform the user and return early.
            // TODO: Should we add a "Copy" button to this error? Then the user can copy the code directly.
            void vscode.window.showErrorMessage(
                'Unable to apply this change to the file. Please try applying this code manually'
            )
            telemetryRecorder.recordEvent('cody.smart-apply.selection', 'not-found')
            return
        }

        telemetryRecorder.recordEvent('cody.smart-apply.selection', selection.type)

        // Move focus to the determined selection
        editor.revealRange(selection.range, vscode.TextEditorRevealType.InCenter)

        if (selection.range.isEmpty) {
            let insertionRange = selection.range

            if (
                selection.type === 'insert' &&
                document.lineAt(document.lineCount - 1).text.trim().length !== 0
            ) {
                // Inserting to the bottom of the file, but the last line is not empty
                // Inject an additional new line for us to use as the insertion range.
                await editor.edit(
                    editBuilder => {
                        editBuilder.insert(selection.range.start, '\n')
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )

                // Update the range to reflect the new end of document
                insertionRange = document.lineAt(document.lineCount - 1).range
            }

            // We determined a selection, but it was empty. This means that we will be _adding_ new code
            // and _inserting_ it into the document. We do not need to re-prompt the LLM for this, let's just
            // add the code directly.
            const task = await this.controller.createTask(
                document,
                configuration.instruction,
                [],
                insertionRange,
                'add',
                'insert',
                model,
                source,
                configuration.document.uri,
                undefined,
                {},
                configuration.id
            )

            const legacyMetadata = {
                intent: task.intent,
                mode: task.mode,
                source: task.source,
            }
            const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
            telemetryRecorder.recordEvent('cody.command.edit', 'executed', {
                metadata,
                privateMetadata: {
                    ...privateMetadata,
                    model: task.model,
                },
            })

            const provider = this.getProviderForTask(task)
            await provider.applyEdit('\n' + configuration.replacement)
            return task
        }

        // We have a selection to replace, we re-prompt the LLM to generate the changes to ensure that
        // we can reliably apply this edit.
        // Just using the replacement code from the response is not enough, as it may contain parts that are not suitable to apply,
        // e.g. // ...
        return this.executeEdit({
            configuration: {
                id: configuration.id,
                document: configuration.document,
                range: selection.range,
                mode: 'edit',
                instruction: ps`Ensuring that you do not duplicate code that it outside of the selection, apply the following change:\n${replacementCode}`,
                model,
                intent: 'edit',
            },
            source,
        })
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
