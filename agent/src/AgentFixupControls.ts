import type * as vscode from 'vscode'
import type { QuickPickInput } from '../../vscode/src/edit/input/get-input'
import type { FixupFile } from '../../vscode/src/non-stop/FixupFile'
import type { FixupTask, FixupTaskID } from '../../vscode/src/non-stop/FixupTask'
import { FixupCodeLenses } from '../../vscode/src/non-stop/codelenses/provider'
import type { FixupActor, FixupFileCollection } from '../../vscode/src/non-stop/roles'
import { type Agent, errorToCodyError } from './agent'
import type { EditTask, ProtocolCommand } from './protocol-alias'

export class AgentFixupControls extends FixupCodeLenses {
    constructor(
        private readonly fixups: FixupActor & FixupFileCollection,
        private readonly notify: typeof Agent.prototype.notify
    ) {
        super(fixups)
    }

    public accept(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.accept(task)
        }
    }

    public undo(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.undo(task)
        }
    }

    public cancel(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.cancel(task)
        }
    }

    public retry(id: FixupTaskID, previousInput: QuickPickInput): Promise<FixupTask | undefined> {
        const task = this.fixups.taskForId(id)
        if (task) {
            return this.fixups.retry(task, 'code-lens', previousInput)
        }
        return Promise.resolve(undefined)
    }

    public getTask(id: FixupTaskID): FixupTask | undefined {
        return this.fixups.taskForId(id)
    }

    didUpdateTask(task: FixupTask): void {
        super.didUpdateTask(task)
        this.notify('editTask/didUpdate', AgentFixupControls.serialize(task))
    }
    didDeleteTask(task: FixupTask): void {
        super.didDeleteTask(task)
        this.notify('editTask/didDelete', AgentFixupControls.serialize(task))
    }

    visibleFilesWithTasksMaybeChanged(files: readonly FixupFile[]): void {}

    dispose() {}

    override notifyCodeLensesChanged(uri: vscode.Uri, codeLenses: vscode.CodeLens[]) {
        super.notifyCodeLensesChanged(uri, codeLenses)
        void this.updateCodeLenses(uri, codeLenses)
    }

    private async updateCodeLenses(uri: vscode.Uri, codeLenses: vscode.CodeLens[]): Promise<void> {
        // VS Code supports icons in code lenses, but we cannot render these through agent.
        // We need to strip any icons from the title and provide those seperately, so the client can decide how to render them.
        const agentLenses = codeLenses.map(lens => ({
            ...lens,
            command: lens.command
                ? {
                      ...lens.command,
                      title: this.splitIconsFromTitle(lens.command.title),
                  }
                : undefined,
        }))

        this.notify('codeLenses/display', {
            uri: uri.toString(),
            codeLenses: agentLenses,
        })
    }

    /**
     * Matches VS Code codicon syntax, e.g. $(cody-logo)
     * Source: https://sourcegraph.com/github.com/microsoft/vscode@f34d4/-/blob/src/vs/base/browser/ui/iconLabel/iconLabels.ts?L9
     */
    private labelWithIconsRegex = /(\\)?\$\(([A-Za-z0-9-]+(?:~[A-Za-z]+)?)\)/g
    /**
     * Given a title, such as "$(cody-logo) Cody", returns the raw
     * title without icons and the icons matched with their respective positions.
     */
    private splitIconsFromTitle(title: string): ProtocolCommand['title'] {
        const icons: { value: string; position: number }[] = []
        const matches = [...title.matchAll(this.labelWithIconsRegex)]

        for (const match of matches) {
            if (match.index !== undefined) {
                icons.push({ value: match[0], position: match.index })
            }
        }

        return { text: title.replace(this.labelWithIconsRegex, ''), icons }
    }

    public static serialize(task: FixupTask): EditTask {
        return {
            id: task.id,
            state: task.state,
            error: errorToCodyError(task.error),
            selectionRange: task.selectionRange,
            instruction: task.instruction?.toString().trim(),
            model: task.model.toString().trim(),
            originalText: task.original,
        }
    }
}
