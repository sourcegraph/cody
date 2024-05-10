import { type LogItem, type LogItemJson, MessageLogItem } from '../items'
import type { LogLevel } from '../items/message'

// The original is set if the log item was emitted on the same process
// This allows sinks like Sentry that run in the same process to leverage
// Raw error objects before they are transformed into JSON
//TODO(rnauta): type this to match J & O
export type LogSinkInput<J extends LogItemJson = LogItemJson> = J extends { _type: infer T }
    ? J & {
          original?: Extract<LogItem, { _type: T }>
      }
    : never
// J & { original: Extract<LogItem, { _type: J['_type'] }> }

export interface LogSink {
    log: (items: LogSinkInput[]) => void
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
    public log(items: LogSinkInput | LogSinkInput[]) {
        for (const item of [items].flat()) {
            this.logOne(item)
        }
    }

    public flush() {}

    private logOne(item: LogSinkInput) {
        if (item.message) {
            const message = MessageLogItem.formatMessage({
                message: item.message,
                visibility: undefined,
            })
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
