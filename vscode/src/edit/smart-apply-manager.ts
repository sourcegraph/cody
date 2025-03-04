import { context } from '@opentelemetry/api'
import { isError } from 'lodash'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import {
    type ChatClient,
    type EventSource,
    FeatureFlag,
    PromptString,
    currentSiteVersion,
    extractContextFromTraceparent,
    featureFlagProvider,
    ps,
    subscriptionDisposable,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { isUriIgnoredByContextFilterWithNotification } from '../cody-ignore/context-filter'
import type { FixupTask } from '../non-stop/FixupTask'

import { SmartApplyContextLogger } from './edit-context-logging'
import type { EditManager } from './edit-manager'
import {
    SMART_APPLY_FILE_DECORATION,
    type SmartApplySelectionType,
    getSmartApplySelection,
} from './prompt/smart-apply'
import type { SmartApplyArguments } from './smart-apply'

type SmartApplyCacheEntry = Promise<null | {
    task: FixupTask
    selectionType: SmartApplySelectionType
}>

export class SmartApplyManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private isPrefetchingEnabled = false
    private smartApplyContextLogger: SmartApplyContextLogger

    private cache = new LRUCache<string, SmartApplyCacheEntry>({ max: 20 })

    constructor(
        private options: {
            editManager: EditManager
            chatClient: ChatClient
        }
    ) {
        this.smartApplyContextLogger = new SmartApplyContextLogger(
            this.options.editManager.editLoggingFeatureFlagManager
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

        const smartApplyAcceptCommand = vscode.commands.registerCommand(
            'cody.command.smart-apply.accept',
            ({ taskId }: { taskId: string }) => {
                vscode.commands.executeCommand('cody.fixup.codelens.accept', taskId)
            }
        )

        const smartApplyRejectCommand = vscode.commands.registerCommand(
            'cody.command.smart-apply.reject',
            ({ taskId }: { taskId: string }) => {
                vscode.commands.executeCommand('cody.fixup.codelens.undo', taskId)
            }
        )

        const prefetchSmartApplyCommand = vscode.commands.registerCommand(
            'cody.command.smart-apply.prefetch',
            (args: SmartApplyArguments) => {
                if (this.isPrefetchingEnabled) {
                    this.prefetchSmartApply(args)
                }
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
            smartApplyCommand,
            smartApplyAcceptCommand,
            smartApplyRejectCommand,
            prefetchSmartApplyCommand
        )
    }

    public async prefetchSmartApply(args: SmartApplyArguments): Promise<void> {
        const { configuration } = args

        if (
            !configuration ||
            this.cache.get(configuration.id) ||
            configuration.isNewFile ||
            (await isUriIgnoredByContextFilterWithNotification(configuration.document.uri, 'edit'))
        ) {
            return
        }

        const model = await this.options.editManager.getEditModel(configuration)
        const taskAndSelection = await this.getSmartApplyTask({
            configuration,
            model,
            shouldUpdateCache: true,
        })

        if (taskAndSelection) {
            const provider = this.options.editManager.getProviderForTask(taskAndSelection.task)
            provider.prefetchStreamingEdit()
        }
    }

    /**
     * Returns a cached smart apply task if it exists, otherwise fetches a new one and caches it.
     */
    private async getSmartApplyTask({
        configuration,
        model,
        shouldUpdateCache,
    }: {
        configuration: SmartApplyArguments['configuration']
        model: string
        shouldUpdateCache: boolean
    }): SmartApplyCacheEntry {
        let inFlight = this.cache.get(configuration.id)

        if (inFlight) {
            // Delete the cached task right after using the potentially cached value to avoid
            // reusing it more than once.
            this.cache.delete(configuration.id)
        } else {
            inFlight = this.fetchSmartApplyTask(configuration, model)

            if (shouldUpdateCache) {
                this.cache.set(configuration.id, inFlight)
            }
        }

        try {
            return inFlight
        } catch (error) {
            this.cache.delete(configuration.id)
            throw error
        }
    }

    private async fetchSmartApplyTask(
        configuration: SmartApplyArguments['configuration'],
        model: string
    ): SmartApplyCacheEntry {
        const { id, instruction, document, replacement } = configuration
        const versions = await currentSiteVersion()
        if (isError(versions)) {
            throw new Error('Unable to determine site version', versions)
        }

        const replacementCode = PromptString.unsafe_fromLLMResponse(replacement)

        const selectionStartTime = performance.now()
        const selection = await getSmartApplySelection({
            id,
            instruction,
            replacement: replacementCode,
            document,
            model,
            chatClient: this.options.chatClient,
            codyApiVersion: versions.codyAPIVersion,
        })
        const selectionTimeTakenMs = performance.now() - selectionStartTime

        if (!selection) {
            telemetryRecorder.recordEvent('cody.smart-apply.selection', 'not-found', {
                billingMetadata: { product: 'cody', category: 'billable' },
            })

            return null
        }

        telemetryRecorder.recordEvent('cody.smart-apply', 'selected', {
            metadata: {
                [selection.type]: 1,
            },
            billingMetadata: { product: 'cody', category: 'billable' },
        })

        const task = await this.options.editManager.createEditTask({
            configuration: {
                id: configuration.id,
                document: configuration.document,
                range: selection?.range || new vscode.Range(0, 0, 0, 0),
                mode: 'edit',
                instruction: ps`Ensuring that you do not duplicate code that is outside of the selection, apply the following change:
${replacementCode}`,
                model,
                intent: 'smartApply',
            },
            source: 'chat',
        })

        if (!task) {
            return null
        }

        this.smartApplyContextLogger.recordSmartApplyBaseContext({
            taskId: task.id,
            model,
            userQuery: configuration.instruction.toString(),
            replacementCodeBlock: replacementCode.toString(),
            document: configuration.document,
            selectionType: selection.type,
            selectionRange: selection.range,
            selectionTimeMs: selectionTimeTakenMs,
        })

        return { task, selectionType: selection.type }
    }

    public async smartApplyEdit(args: SmartApplyArguments): Promise<void> {
        const {
            configuration: { document, traceparent, isNewFile },
            configuration,
            source = 'chat',
        } = args

        return context.with(extractContextFromTraceparent(traceparent), async () => {
            await wrapInActiveSpan('edit.smart-apply', async span => {
                span.setAttribute('sampled', true)
                span.setAttribute('continued', true)

                if (await isUriIgnoredByContextFilterWithNotification(document.uri, 'edit')) {
                    return
                }

                const model = await this.options.editManager.getEditModel(configuration)

                telemetryRecorder.recordEvent('cody.command.smart-apply', 'executed', {
                    billingMetadata: {
                        product: 'cody',
                        category: 'core',
                    },
                })

                const editor = await vscode.window.showTextDocument(document.uri)

                if (isNewFile) {
                    return this.applyInsertionEdit({
                        configuration,
                        editor,
                        model,
                        source,
                        selectionType: null,
                        selectionRange: null,
                    })
                }

                const documentRange = new vscode.Range(0, 0, document.lineCount, 0)

                editor.setDecorations(SMART_APPLY_FILE_DECORATION, [documentRange])
                const taskAndSelection = await this.getSmartApplyTask({
                    configuration,
                    model,
                    shouldUpdateCache: false,
                })
                editor.setDecorations(SMART_APPLY_FILE_DECORATION, [])

                if (!taskAndSelection) {
                    void vscode.window.showErrorMessage(
                        'Unable to apply this change to the file. Please try applying this code manually'
                    )
                    return
                }

                const { task, selectionType } = taskAndSelection
                editor.revealRange(task.selectionRange, vscode.TextEditorRevealType.InCenter)

                if (task.selectionRange.isEmpty) {
                    return this.applyInsertionEdit({
                        configuration,
                        editor,
                        model,
                        source: source as EventSource,
                        selectionRange: task.selectionRange,
                        selectionType,
                    })
                }

                await this.measureAndLogEditOperation(task.id, () =>
                    this.options.editManager.startStreamingEditTask({
                        task,
                        editor: { active: editor },
                    })
                )
            })
        })
    }

    /**
     * Measures the execution time of an edit operation and logs the results.
     */
    private async measureAndLogEditOperation<T>(
        taskId: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const applyStartTime = performance.now()
        const result = await operation()
        const applyTimeTakenMs = performance.now() - applyStartTime

        this.smartApplyContextLogger.addApplyContext({
            taskId,
            applyTimeMs: applyTimeTakenMs,
        })
        this.smartApplyContextLogger.logSmartApplyContextToTelemetry(taskId)

        return result
    }

    private async applyInsertionEdit({
        configuration,
        editor,
        model,
        source,
        selectionRange,
        selectionType,
    }: {
        configuration: SmartApplyArguments['configuration']
        editor: vscode.TextEditor
        model: string
        source: EventSource
        selectionRange: vscode.Range | null
        selectionType: SmartApplySelectionType | null
    }): Promise<void> {
        const { id, document, replacement, instruction, isNewFile } = configuration

        let insertionRange: vscode.Range
        let finalReplacement: string

        if (isNewFile) {
            insertionRange = new vscode.Range(0, 0, 0, 0)
            finalReplacement = replacement
        } else {
            // For non-new files, selection must be provided
            insertionRange = selectionRange!
            if (
                selectionType === 'insert' &&
                document.lineAt(document.lineCount - 1).text.trim().length !== 0
            ) {
                // Inserting to the bottom of the file, but the last line is not empty
                // Inject an additional new line for us to use as the insertion range.
                await editor.edit(
                    editBuilder => {
                        editBuilder.insert(selectionRange!.start, '\n')
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )

                // Update the range to reflect the new end of document
                insertionRange = document.lineAt(document.lineCount - 1).range
            }
            finalReplacement = '\n' + replacement
        }

        const task = this.options.editManager.createTaskAndCheckForDuplicates({
            taskId: id,
            document,
            instruction,
            userContextFiles: [],
            selectionRange: insertionRange,
            intent: 'add',
            mode: 'insert',
            model,
            rules: null,
            source,
            destinationFile: document.uri,
            insertionPoint: undefined,
            telemetryMetadata: {},
        })

        if (!task) {
            return
        }

        this.options.editManager.logExecutedTaskEvent(task)
        const provider = this.options.editManager.getProviderForTask(task)
        await this.measureAndLogEditOperation(task.id, () => provider.applyEdit(finalReplacement))
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
