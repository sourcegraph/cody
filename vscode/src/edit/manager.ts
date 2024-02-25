import * as vscode from 'vscode'

import { type ChatClient, ConfigFeaturesSingleton, type ModelProvider } from '@sourcegraph/cody-shared'

import type { ContextProvider } from '../chat/ContextProvider'
import type { GhostHintDecorator } from '../commands/GhostHintDecorator'
import { getEditor } from '../editor/active-editor'
import type { VSCodeEditor } from '../editor/vscode-editor'
import { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'

import type { AuthStatus } from '../chat/protocol'
import { editModel } from '../models'
import type { AuthProvider } from '../services/AuthProvider'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { DEFAULT_EDIT_MODE } from './constants'
import type { ExecuteEditArguments } from './execute'
import { EditProvider } from './provider'
import { getEditIntent } from './utils/edit-intent'
import { getEditModelsForUser } from './utils/edit-models'
import { getEditLineSelection, getEditSmartSelection } from './utils/edit-selection'

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
        this.models = getEditModelsForUser(options.authProvider.getAuthStatus())
        this.controller = new FixupController(options.authProvider)
        this.disposables.push(
            this.controller,
            vscode.commands.registerCommand('cody.command.edit-code', (args: ExecuteEditArguments) =>
                this.executeEdit(args)
            )
        )
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
            source = 'editor',
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
        if (configuration.instruction?.trim()) {
            task = await this.controller.createTask(
                document,
                configuration.instruction,
                configuration.userContextFiles ?? [],
                expandedRange || range,
                intent,
                mode,
                model,
                source,
                configuration.contextMessages,
                configuration.destinationFile
            )
        } else {
            task = await this.controller.promptUserForTask(
                document,
                range,
                expandedRange,
                mode,
                model,
                intent,
                configuration.contextMessages || [],
                source
            )
        }

        if (!task) {
            return
        }

        // Log the default edit command name for doc intent or test mode
        const isDocCommand = configuration.intent === 'doc' ? 'doc' : undefined
        const isUnitTestCommand = configuration.intent === 'test' ? 'test' : undefined
        const eventName = isDocCommand ?? isUnitTestCommand ?? 'edit'
        telemetryService.log(
            `CodyVSCodeExtension:command:${eventName}:executed`,
            { source },
            { hasV2Event: true }
        )
        telemetryRecorder.recordEvent(`cody.command.${eventName}`, 'executed', {
            privateMetadata: { source },
        })

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

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
