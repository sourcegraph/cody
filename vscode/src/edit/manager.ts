import { context } from '@opentelemetry/api'
import * as vscode from 'vscode'

import {
    type ChatClient,
    ClientConfigSingleton,
    DEFAULT_EVENT_SOURCE,
    type EventSource,
    FeatureFlag,
    PromptString,
    currentSiteVersion,
    extractContextFromTraceparent,
    featureFlagProvider,
    firstResultFromOperation,
    modelsService,
    ps,
    subscriptionDisposable,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { isUriIgnoredByContextFilterWithNotification } from '../cody-ignore/context-filter'
import type { GhostHintDecorator } from '../commands/GhostHintDecorator'
import { getEditor } from '../editor/active-editor'
import type { VSCodeEditor } from '../editor/vscode-editor'
import type { ExtensionClient } from '../extension-client'
import type { CreateTaskOptions, FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'
import { ACTIVE_TASK_STATES } from '../non-stop/codelenses/constants'
import { splitSafeMetadata } from '../services/telemetry-v2'

import { EditCacheManager } from './cache-manager'
import {
    EditLoggingFeatureFlagManager,
    SmartApplyContextLogger,
    getEditLoggingContext,
} from './edit-context-logging'
import type { ExecuteEditArguments } from './execute'
import { SMART_APPLY_FILE_DECORATION, getSmartApplySelection } from './prompt/smart-apply'
import { EditProvider } from './provider'
import type { SmartApplyArguments } from './smart-apply'
import { getEditIntent } from './utils/edit-intent'
import { getEditMode } from './utils/edit-mode'
import { getEditLineSelection, getEditSmartSelection } from './utils/edit-selection'

interface ExecuteSmartApplyEditParams {
    configuration: SmartApplyArguments['configuration']
    source: EventSource
    range: vscode.Range
    replacementCode: PromptString
    model: string
    isPrefetch: boolean
}

export interface EditManagerOptions {
    editor: VSCodeEditor
    chat: ChatClient
    ghostHintDecorator: GhostHintDecorator
    extensionClient: ExtensionClient
    controller: FixupController
}

// EditManager handles translating specific edit intents (document, edit) into
// generic FixupTasks, and pairs a FixupTask with an EditProvider to generate
// a completion.
export class EditManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private editProviders = new WeakMap<FixupTask, EditProvider>()

    private isPrefetchingEnabled = false
    private cacheManager = new EditCacheManager()

    private loggingFeatureFlagManagerInstance = new EditLoggingFeatureFlagManager()
    private smartApplyContextLogger = new SmartApplyContextLogger(this.loggingFeatureFlagManagerInstance)

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

        const prefetchSmartApplyCommand = vscode.commands.registerCommand(
            'cody.command.smart-apply-prefetch',
            (args: SmartApplyArguments) => {
                if (this.isPrefetchingEnabled) {
                    this.prefetchSmartApply(args)
                }
            }
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

        this.disposables.push(
            subscriptionDisposable(
                featureFlagProvider
                    .evaluatedFeatureFlag(FeatureFlag.CodySmartApplyPrefetching)
                    .subscribe(isPrefetchingEnabled => {
                        this.isPrefetchingEnabled = Boolean(isPrefetchingEnabled)
                    })
            )
        )

        this.disposables.push(
            this.options.controller,
            editCommand,
            smartApplyCommand,
            prefetchSmartApplyCommand,
            startCommand,
            this.loggingFeatureFlagManagerInstance
        )
    }

    /**
     * Allows you to prefetch the smart apply response in advance (e.g., when
     * rendering a button) so that when the user eventually triggers smartApplyEdit,
     * the response is already cached or in-flight.
     */
    public async prefetchSmartApply(args: SmartApplyArguments): Promise<void> {
        const { configuration } = args

        if (
            !configuration ||
            this.cacheManager.getSelectionPromise(configuration.id) ||
            configuration.isNewFile ||
            (await isUriIgnoredByContextFilterWithNotification(configuration.document.uri, 'edit'))
        ) {
            return
        }

        const model =
            configuration.model || (await firstResultFromOperation(modelsService.getDefaultEditModel()))
        if (!model) {
            throw new Error('No default edit model found. Please set one.')
        }

        const replacementCode = PromptString.unsafe_fromLLMResponse(configuration.replacement)
        const selection = await this.fetchSmartApplySelection(configuration, replacementCode, model)

        // Once the selection is fetched, we also prefetch the LLM response.
        await this.executeSmartApplyEdit({
            configuration,
            source: 'chat',
            range: selection?.range || new vscode.Range(0, 0, 0, 0),
            replacementCode,
            model,
            isPrefetch: true,
        })
    }

    /**
     * "executeEdit" can now optionally prefetch the LLM response by calling
     * "provider.prefetchEdit" instead of "provider.startEdit." This is controlled
     * by the "prefetchOnly" parameter. If true, we kick off streaming in the background
     * but do not immediately apply the edit to the user's file.
     */
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
            isPrefetch,
        } = args
        const clientConfig = await ClientConfigSingleton.getInstance().getConfig()
        if (!clientConfig?.customCommandsEnabled) {
            void vscode.window.showErrorMessage(
                'This feature has been disabled by your Sourcegraph site admin.'
            )
            return
        }

        const editor = getEditor()
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
        // It is possible that these values may be overridden later,
        // e.g. if the user changes them in the edit input.
        const range = getEditLineSelection(document, proposedRange)
        const model =
            configuration.model || (await firstResultFromOperation(modelsService.getDefaultEditModel()))
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
            task = await this.createTaskAndCheckForDuplicates({
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
                isPrefetch,
            })
        } else {
            task = await this.options.controller.promptUserForTask(
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

        if (!task) {
            return
        }

        if (!isPrefetch) {
            this.logExectuedTelemetryEvent(task)
        }

        /**
         * Updates the editor's selection and view for 'doc' or 'test' intents, causing the cursor to
         * move to the beginning of the selection range considered for the edit.
         */
        if (editor.active && (intent === 'doc' || intent === 'test')) {
            const newPosition = proposedRange.start
            editor.active.selection = new vscode.Selection(newPosition, newPosition)
            editor.active.revealRange(
                new vscode.Range(newPosition, newPosition),
                vscode.TextEditorRevealType.InCenter
            )
        }

        const provider = this.getProviderForTask(task)

        if (isPrefetch) {
            await provider.prefetchEdit()
        } else {
            this.options.controller.startDecorator(task)
            await provider.startEdit()
        }

        return task
    }

    public async smartApplyEdit(args: SmartApplyArguments): Promise<void> {
        return context.with(extractContextFromTraceparent(args.configuration.traceparent), async () => {
            await wrapInActiveSpan('edit.smart-apply', async span => {
                span.setAttribute('sampled', true)
                span.setAttribute('continued', true)

                const { configuration, source = 'chat' } = args
                if (!configuration) {
                    return
                }

                const document = configuration.document
                if (await isUriIgnoredByContextFilterWithNotification(document.uri, 'edit')) {
                    return
                }

                const model =
                    configuration.model ||
                    (await firstResultFromOperation(modelsService.getDefaultEditModel()))
                if (!model) {
                    throw new Error('No default edit model found. Please set one.')
                }

                telemetryRecorder.recordEvent('cody.command.smart-apply', 'executed', {
                    billingMetadata: {
                        product: 'cody',
                        category: 'core',
                    },
                })

                const editor = await vscode.window.showTextDocument(document.uri)

                if (configuration.isNewFile) {
                    // We are creating a new file, this means we are only _adding_ new code and _inserting_ it into the document.
                    // We do not need to re-prompt the LLM for this, let's just add the code directly.
                    const task = await this.createTaskAndCheckForDuplicates({
                        document,
                        instruction: configuration.instruction,
                        userContextFiles: [],
                        selectionRange: new vscode.Range(0, 0, 0, 0),
                        intent: 'add',
                        mode: 'insert',
                        model,
                        rules: null,
                        source,
                        destinationFile: configuration.document.uri,
                        insertionPoint: undefined,
                        telemetryMetadata: {},
                        taskId: configuration.id,
                        isPrefetch: false,
                    })
                    if (!task) {
                        return
                    }
                    this.logExectuedTelemetryEvent(task)
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

                const versions = await currentSiteVersion()
                if (versions instanceof Error) {
                    throw new Error('unable to determine site version')
                }

                const contextloggerRequestId =
                    this.smartApplyContextLogger.createSmartApplyLoggingRequest({
                        model: model,
                        userQuery: configuration.instruction.toString(),
                        replacementCodeBlock: replacementCode.toString(),
                        document: configuration.document,
                    })

                const selectionStartTime = Date.now()
                const selection = await this.fetchSmartApplySelection(
                    configuration,
                    replacementCode,
                    model
                )
                const selectionTimeTakenMs = Date.now() - selectionStartTime

                // We finished prompting the LLM for the selection, we can now remove the "progress" decoration
                // that indicated we where working on the full file.
                editor.setDecorations(SMART_APPLY_FILE_DECORATION, [])

                if (!selection) {
                    // We couldn't figure out the selection, let's inform the user and return early.
                    // TODO: Should we add a "Copy" button to this error? Then the user can copy the code directly.
                    void vscode.window.showErrorMessage(
                        'Unable to apply this change to the file. Please try applying this code manually'
                    )
                    telemetryRecorder.recordEvent('cody.smart-apply.selection', 'not-found', {
                        billingMetadata: { product: 'cody', category: 'billable' },
                    })
                    return
                }

                telemetryRecorder.recordEvent('cody.smart-apply', 'selected', {
                    metadata: {
                        [selection.type]: 1,
                    },
                    billingMetadata: { product: 'cody', category: 'billable' },
                })

                this.smartApplyContextLogger.addSmartApplySelectionContext(
                    contextloggerRequestId,
                    selection.type,
                    selection.range,
                    selectionTimeTakenMs,
                    configuration.document
                )

                // Move focus to the determined selection
                editor.revealRange(selection.range, vscode.TextEditorRevealType.InCenter)

                if (selection.range.isEmpty) {
                    // We determined a selection, but it was empty. This means that we will be _adding_ new code
                    // and _inserting_ it into the document. We do not need to re-prompt the LLM for this, let's just add the code directly.
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

                    const task = await this.createTaskAndCheckForDuplicates({
                        document,
                        instruction: configuration.instruction,
                        userContextFiles: [],
                        selectionRange: insertionRange,
                        intent: 'add',
                        mode: 'insert',
                        model,
                        rules: null,
                        source,
                        destinationFile: configuration.document.uri,
                        insertionPoint: undefined,
                        telemetryMetadata: {},
                        taskId: configuration.id,
                        isPrefetch: false,
                    })
                    if (!task) {
                        return
                    }
                    this.logExectuedTelemetryEvent(task)
                    const provider = this.getProviderForTask(task)
                    await provider.applyEdit('\n' + configuration.replacement)
                    return task
                }

                // We have a selection to replace, we re-prompt the LLM to generate the changes to ensure that
                // we can reliably apply this edit.
                // Just using the replacement code from the response is not enough, as it may contain parts that are not suitable to apply,
                // e.g. // ...
                const applyStartTime = Date.now()
                const task = await this.executeSmartApplyEdit({
                    configuration,
                    source,
                    range: selection.range,
                    replacementCode,
                    model,
                    isPrefetch: false,
                })
                const applyTimeTakenMs = Date.now() - applyStartTime
                this.smartApplyContextLogger.addApplyContext(
                    contextloggerRequestId,
                    applyTimeTakenMs,
                    task?.id
                )
                this.smartApplyContextLogger.logSmartApplyContextToTelemetry(contextloggerRequestId)
                return
            })
        })
    }

    private async executeSmartApplyEdit({
        configuration,
        source,
        range,
        replacementCode,
        model,
        isPrefetch,
    }: ExecuteSmartApplyEditParams): Promise<FixupTask | undefined> {
        return this.executeEdit({
            configuration: {
                id: configuration.id,
                document: configuration.document,
                range,
                mode: 'edit',
                instruction: ps`Ensuring that you do not duplicate code outside the selection, apply:\n${replacementCode}`,
                model,
                intent: 'edit',
            },
            source,
            isPrefetch,
        })
    }

    private async fetchSmartApplySelection(
        configuration: SmartApplyArguments['configuration'],
        replacementCode: PromptString,
        model: string
    ): Promise<ReturnType<typeof getSmartApplySelection>> {
        let inFlight = this.cacheManager.getSelectionPromise(configuration.id)
        if (!inFlight) {
            inFlight = (async (): Promise<ReturnType<typeof getSmartApplySelection>> => {
                const versions = await currentSiteVersion()
                if (!versions || versions instanceof Error) {
                    throw new Error('unable to determine site version')
                }
                return getSmartApplySelection(
                    configuration.id,
                    configuration.instruction,
                    replacementCode,
                    configuration.document,
                    model,
                    this.options.chat,
                    versions.codyAPIVersion
                )
            })()
            this.cacheManager.setSelectionPromise(configuration.id, inFlight)
        }
        try {
            return await inFlight
        } catch (error) {
            this.cacheManager.delete(configuration.id)
            throw error
        }
    }

    /**
     * Helper to create a new FixupTask, check for duplicates, record telemetry,
     * and return the resulting task or null if cancelled.
     */
    private async createTaskAndCheckForDuplicates(
        createTaskOptions: CreateTaskOptions
    ): Promise<FixupTask | null> {
        const task = await this.options.controller.createTask(createTaskOptions)
        if (!task) {
            return null
        }

        /**
         * Checks if there is already an active task for the given fixup file
         * that has the same instruction and selection range as the current task.
         */
        const activeTask = this.options.controller.tasksForFile(task.fixupFile).find(activeTask => {
            return (
                ACTIVE_TASK_STATES.includes(activeTask.state) &&
                activeTask.instruction.toString() === task.instruction.toString() &&
                activeTask.selectionRange.isEqual(task.selectionRange)
            )
        })

        if (activeTask) {
            this.options.controller.cancel(task)
            return null
        }

        return task
    }

    private logExectuedTelemetryEvent(task: FixupTask): void {
        const { intent, telemetryMetadata, mode, source, document, selectionRange, model } = task

        const isDocCommand = intent === 'doc' ? 'doc' : undefined
        const isUnitTestCommand = intent === 'test' ? 'test' : undefined
        const isFixCommand = intent === 'fix' ? 'fix' : undefined
        const eventName = isDocCommand ?? isUnitTestCommand ?? isFixCommand ?? 'edit'

        const editContext = getEditLoggingContext({
            isFeatureFlagEnabledForLogging:
                this.loggingFeatureFlagManagerInstance.isEditContextDataCollectionFlagEnabled(),
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

    private getProviderForTask(task: FixupTask): EditProvider {
        let provider = this.editProviders.get(task)

        if (!provider) {
            provider = new EditProvider({ task, ...this.options, cacheManager: this.cacheManager })
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
