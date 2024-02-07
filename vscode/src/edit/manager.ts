import * as vscode from 'vscode'

import {
    ConfigFeaturesSingleton,
    type ChatClient,
    type ChatEventSource,
    type ModelProvider,
} from '@sourcegraph/cody-shared'

import type { ContextProvider } from '../chat/ContextProvider'
import type { GhostHintDecorator } from '../commands/GhostHintDecorator'
import { getEditor } from '../editor/active-editor'
import type { VSCodeEditor } from '../editor/vscode-editor'
import { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'

import type { ExecuteEditArguments } from './execute'
import { EditProvider } from './provider'
import { getEditSmartSelection } from './utils/edit-selection'
import { DEFAULT_EDIT_INTENT, DEFAULT_EDIT_MODE } from './constants'
import type { AuthProvider } from '../services/AuthProvider'
import { editModel } from '../models'
import { getEditModelsForUser } from './utils/edit-models'

export interface EditManagerOptions {
    editor: VSCodeEditor
    chat: ChatClient
    contextProvider: ContextProvider
    ghostHintDecorator: GhostHintDecorator
    authProvider: AuthProvider
}

export class EditManager implements vscode.Disposable {
    private controller: FixupController
    private disposables: vscode.Disposable[] = []
    private editProviders = new Map<FixupTask, EditProvider>()
    private models: ModelProvider[] = []

    constructor(public options: EditManagerOptions) {
        this.models = getEditModelsForUser(options.authProvider)
        this.controller = new FixupController(options.authProvider)
        this.disposables.push(
            this.controller,
            vscode.commands.registerCommand(
                'cody.command.edit-code',
                (args: ExecuteEditArguments, source?: ChatEventSource) => this.executeEdit(args, source)
            )
        )
    }

    public async executeEdit(
        args: ExecuteEditArguments = {},
        source: ChatEventSource = 'menu'
    ): Promise<FixupTask | undefined> {
        const configFeatures = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
        if (!configFeatures.commands) {
            void vscode.window.showErrorMessage(
                'This feature has been disabled by your Sourcegraph site admin.'
            )
            return
        }

        // Log the default edit command name for doc intent or test mode
        const isDocCommand = args?.intent === 'doc' ? 'doc' : undefined
        const isUnitTestCommand = args?.intent === 'test' ? 'test' : undefined
        const eventName = isDocCommand ?? isUnitTestCommand ?? 'edit'
        telemetryService.log(
            `CodyVSCodeExtension:command:${eventName}:executed`,
            { source },
            { hasV2Event: true }
        )
        telemetryRecorder.recordEvent(`cody.command.${eventName}`, 'executed', {
            privateMetadata: { source },
        })

        const editor = getEditor()
        if (editor.ignored) {
            void vscode.window.showInformationMessage('Cannot edit Cody ignored file.')
            return
        }

        const document = args.document || editor.active?.document
        if (!document) {
            void vscode.window.showErrorMessage('Please open a file before running a command.')
            return
        }

        const range = args.range || editor.active?.selection
        if (!range) {
            return
        }

        if (editor.active) {
            // Clear out any active ghost text
            this.options.ghostHintDecorator.clearGhostText(editor.active)
        }

        // Set default edit configuration, if not provided
        const mode = args.mode || DEFAULT_EDIT_MODE
        const model = args.model || editModel.get(this.options.authProvider, this.models)
        const intent = args.intent || DEFAULT_EDIT_INTENT

        let expandedRange: vscode.Range | undefined
        // Support expanding the selection range for intents where it is useful
        if (intent !== 'add') {
            const smartRange = await getEditSmartSelection(document, range)

            if (!smartRange.isEqual(range)) {
                expandedRange = smartRange
            }
        }

        let task: FixupTask | null
        if (args.instruction?.trim()) {
            task = await this.controller.createTask(
                document,
                args.instruction,
                args.userContextFiles ?? [],
                expandedRange || range,
                intent,
                mode,
                model,
                source,
                args.contextMessages,
                args.destinationFile
            )
        } else {
            task = await this.controller.promptUserForTask(
                document,
                range,
                expandedRange,
                mode,
                model,
                intent,
                args.contextMessages || [],
                source
            )
        }

        if (!task) {
            return
        }

        const provider = this.getProviderForTask(task)
        await provider.startEdit()
        return task
    }

    public getProviderForTask(task: FixupTask): EditProvider {
        let provider = this.editProviders.get(task)

        if (!provider) {
            provider = new EditProvider({ task, controller: this.controller, ...this.options })
            this.editProviders.set(task, provider)
        }

        return provider
    }

    public removeProviderForTask(task: FixupTask): void {
        const provider = this.editProviders.get(task)

        if (provider) {
            this.editProviders.delete(task)
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
