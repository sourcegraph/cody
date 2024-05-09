import type { Configuration } from '@sourcegraph/cody-shared'
import type { LogSink, LogSinkInput } from '@sourcegraph/cody-shared/src/logtrace'
import type * as vscode from 'vscode'

export type LogTraceSinksContext = Pick<vscode.ExtensionContext, 'logUri' | 'storagePath'>
export type LogTraceSinksConfig = Pick<Configuration, 'isRunningInsideAgent' | 'agentIDE'>

export abstract class LogTraceSinksService implements vscode.Disposable {
    protected disposables: vscode.Disposable[] = []
    protected vscodeOutputSink?: VSCodeOutputSink
    constructor(
        protected context: LogTraceSinksContext,
        protected config: LogTraceSinksConfig
    ) {
        this.reconfigure(null)
    }

    public onConfigurationChange(newConfig: LogTraceSinksConfig) {
        const previousConfig = this.config
        this.config = newConfig
        this.reconfigure(previousConfig)
    }

    protected abstract reconfigure(previousConfig: LogTraceSinksConfig | null): void

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}

export class VSCodeOutputSink implements LogSink, vscode.Disposable {
    public channel: vscode.OutputChannel
    public log(item: LogSinkInput | LogSinkInput[]) {
        Array.isArray(item) ? item.forEach(this.logOne.bind(this)) : this.logOne(item)
    }

    private logOne(item: LogSinkInput) {
        if (item.message) {
            this.channel.appendLine(`${item.timestamp}\t${item.message}`)
        }
    }
    public flush() {}

    public constructor(channel: vscode.OutputChannel) {
        this.channel = channel
    }
    dispose() {
        throw new Error('Method not implemented.')
    }
}
