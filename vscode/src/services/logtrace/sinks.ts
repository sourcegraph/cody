import type { Configuration } from '@sourcegraph/cody-shared'
import type { LogSink, LogSinkInput } from '@sourcegraph/cody-shared/src/logtrace'
import type { MessageLogItemJson } from '@sourcegraph/cody-shared/src/logtrace'
import { MessageLogItem } from '@sourcegraph/cody-shared/src/logtrace'
import { format as formatTimestamp } from 'date-fns'
import * as vscode from 'vscode'
export type LogTraceSinksContext = Pick<vscode.ExtensionContext, 'logUri' | 'storagePath'>
export type LogTraceSinksConfig = Pick<Configuration, 'isRunningInsideAgent' | 'agentIDE'>

export abstract class LogTraceSinksService implements vscode.Disposable {
    protected disposables: vscode.Disposable[] = []
    protected vscodeOutputSink?: VSCodeOutputSink
    constructor(
        protected context: LogTraceSinksContext,
        protected config: LogTraceSinksConfig
    ) {
        this.onConfigurationChange(config)
    }

    public onConfigurationChange(newConfig: LogTraceSinksConfig) {
        const previousConfig = this.config
        this.config = newConfig

        if (!this.vscodeOutputSink) {
            const userChannel = vscode.window.createOutputChannel('Cody by Sourcegraph - Log', 'log')
            userChannel.clear()
            this.vscodeOutputSink = new VSCodeOutputSink(userChannel)
            this.disposables.push(this.vscodeOutputSink, userChannel)
        }
        this.reconfigure(previousConfig)
    }

    protected abstract reconfigure(previousConfig: LogTraceSinksConfig | null): void

    dispose() {
        this.vscodeOutputSink?.flush()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.vscodeOutputSink = undefined
        this.disposables = []
    }
}

export class VSCodeOutputSink implements LogSink, vscode.Disposable {
    public static DEDUPE_WINDOW = 3 * 1000 // duplicate messages within 3 seconds are de-duplicated
    private lastMessage: {
        dedupeMessageShown: boolean
        message: string
        data: string
        timestamp: Date
    } = {
        dedupeMessageShown: false,
        message: '',
        data: '',
        timestamp: new Date(),
    }
    private origins: Array<string> = []

    public constructor(public channel: vscode.OutputChannel) {}
    public log(item: LogSinkInput | LogSinkInput[]) {
        //todo sort items by timestamp
        Array.isArray(item)
            ? item
                  .toSorted(
                      (a, b) => Date.parse(a.timestamp.datetime) - Date.parse(b.timestamp.datetime)
                  )
                  .forEach(this.logOne.bind(this))
            : this.logOne(item)
    }

    private logOne(item: LogSinkInput) {
        switch (item._type) {
            case 'MessageLogItem':
                this.logMessage(item)
        }
    }

    private logMessage(item: LogSinkInput<MessageLogItemJson>) {
        const timestamp = new Date(Date.parse(item.timestamp.datetime))
        const timestampString = formatTimestamp(timestamp, 'yyyy-MM-dd HH:mm:ss')
        const severityString = item.level.toUpperCase()
        let senderIdx = this.origins.indexOf(item.origin.id)
        if (senderIdx === -1) {
            this.origins.push(item.origin.id)
            senderIdx = this.origins.length - 1
        }

        // we on-purpose don't include item visibility because this is user facing
        const messageString = MessageLogItem.formatMessage({
            message: item.message,
            visibility: undefined,
        })
        const dataString = JSON.stringify(
            MessageLogItem.maskData({ data: item.data, visibility: undefined, verbose: item.verbose }),
            null,
            2
        )

        // if we've already logged this exact message within the REPEAT_WINDOW
        // we don't log it again because that would be annoying
        const lastMessage = this.lastMessage
        this.lastMessage = {
            timestamp,
            message: messageString,
            data: dataString,
            dedupeMessageShown: false,
        }
        if (
            lastMessage.message === messageString &&
            lastMessage.data === dataString &&
            timestamp.getTime() - lastMessage.timestamp.getTime() < VSCodeOutputSink.DEDUPE_WINDOW
        ) {
            this.lastMessage.dedupeMessageShown = true
            if (!lastMessage.dedupeMessageShown) {
                this.channel.appendLine('\n(Skipping duplicate messages)')
            }
            return
        }

        // otherwise we log as normal
        this.channel.appendLine('\n') //start with a double blank line
        const prefixString = `➤ ${timestampString} [${senderIdx}] ${severityString}`
        const prefixSpaces = '  '
        this.channel.appendLine(`${prefixString} ${messageString}`)

        // callsite
        if (item.origin.callsite) {
            const callsiteString = `${item.origin.callsite.fullFilePath}:${item.origin.callsite.line}:${item.origin.callsite.column}`
            this.channel.appendLine(`${prefixSpaces} ${callsiteString}`)
        }

        // data
        if (Object.entries(item.data).length > 0) {
            this.channel.appendLine('')
            for (const line of dataString.split('\n')) {
                this.channel.appendLine(`${prefixSpaces}  ${line}`)
            }
        }
    }
    public flush() {}

    dispose() {}
}
