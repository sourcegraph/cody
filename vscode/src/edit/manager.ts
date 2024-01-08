import * as vscode from 'vscode'

import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { ContextProvider } from '../chat/ContextProvider'
import { getEditor } from '../editor/active-editor'
import { VSCodeEditor } from '../editor/vscode-editor'
import { FixupController } from '../non-stop/FixupController'
import { FixupTask } from '../non-stop/FixupTask'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'

import { ExecuteEditArguments } from './execute'
import { EditProvider } from './provider'
import { EditIntent } from './types'

export interface EditManagerOptions {
    editor: VSCodeEditor
    chat: ChatClient
    contextProvider: ContextProvider
}

export class EditManager implements vscode.Disposable {
    private controller: FixupController
    private disposables: vscode.Disposable[] = []
    private editProviders = new Map<FixupTask, EditProvider>()

    constructor(public options: EditManagerOptions) {
        this.controller = new FixupController()
        this.disposables.push(
            this.controller,
            vscode.commands.registerCommand(
                'cody.command.edit-code',
                (
                    args: {
                        range?: vscode.Range
                        instruction?: string
                        intent?: EditIntent
                        document?: vscode.TextDocument
                        insertMode?: boolean
                    },
                    source?: ChatEventSource
                ) => this.executeEdit(args, source)
            )
        )
    }

    public async executeEdit(args: ExecuteEditArguments = {}, source: ChatEventSource = 'editor'): Promise<void> {
        const commandEventName = source === 'doc' ? 'doc' : 'edit'
        telemetryService.log(
            `CodyVSCodeExtension:command:${commandEventName}:executed`,
            { source },
            { hasV2Event: true }
        )
        telemetryRecorder.recordEvent(`cody.command.${commandEventName}`, 'executed', { privateMetadata: { source } })

        const editor = getEditor()
        if (editor.ignored) {
            console.error('File was ignored by Cody.')
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

        const task = args.instruction?.trim()
            ? await this.controller.createTask(
                  document.uri,
                  args.instruction,
                  range,
                  args.intent,
                  args.insertMode,
                  source
              )
            : await this.controller.promptUserForTask(args, source)
        if (!task) {
            return
        }

        const provider = this.getProviderForTask(task)
        return provider.startEdit()
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
