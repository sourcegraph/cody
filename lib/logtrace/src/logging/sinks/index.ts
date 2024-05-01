import type { ReadonlyDeep } from 'type-fest'
import type { LogItem, LogItemJson } from '../items'
import type { LogLevel } from '../items/message'

export type LogSinkInput = ReadonlyDeep<LogItem>
export type LogSinkJsonInput = ReadonlyDeep<LogItemJson>

export interface LogSink {
    log?: (item: LogSinkInput | LogSinkInput[]) => void
    logJson?: (item: LogSinkJsonInput | LogSinkJsonInput[]) => void
    flush: () => void
}

/**
 * A sink that saves log messages. This can be useful if you want to re-emit
 * already logged messages after an output comes online
 */
export class SaveLogItemsSink implements LogSink {
    private _savedInputs: LogSinkInput[] = []
    public constructor(public maxMessages = 1000) {}
    public log(item: LogSinkInput | LogSinkInput[]) {
        if (Array.isArray(item)) {
            this._savedInputs.push(...item)
        } else {
            this._savedInputs.push(item)
        }
        if (this._savedInputs.length > this.maxMessages) {
            this._savedInputs.splice(0, this._savedInputs.length - this.maxMessages)
        }
    }

    public get savedInputs() {
        return this._savedInputs
    }

    public flush() {}
}

/**
 * A basic sink that logs messages to the console.
 */
export class ConsoleLogMessageSink implements LogSink {
    public logJson(item: LogSinkJsonInput | LogSinkJsonInput[]) {
        Array.isArray(item) ? item.forEach(this.logOne.bind(this)) : this.logOne(item)
    }

    public flush() {}

    private logOne(item: LogSinkJsonInput) {
        if (item.message) {
            const message = `${item.timestamp}\t${item.message}`
            switch (item.level) {
                case 'alert':
                    console.error(message)
                    break
                case 'warn':
                    console.warn(message)
                    break
                default:
                    console.log(message)
            }
        }
    }
}

/**
 * A sink that automatically adds any @link{ErrorWrapper} wrapped errors in the
 * MessageLogItem.data to any active trace span
 */
export interface TraceSpanErrorSinkOptions {
    /**
     * Minimum level for a log message to look for errors to add to the trace
     * span
     */
    minLevel?: LogLevel
    /**
     * The maximum depth to look for keys containing @link{ErrorWrapper} or
     * Array<ErrorWrapper> values.
     */
    maxDepth?: number
}
const defaultTraceErrorSinkOptions = {
    minLevel: 'warn' as const,
    maxDepth: 0,
}
export class TraceSpanErrorSink implements LogSink {
    public constructor(public opts: TraceSpanErrorSinkOptions = defaultTraceErrorSinkOptions) {}
    public log(item: LogSinkInput | LogSinkInput[]): void {
        return
    }

    public flush() {}
}
