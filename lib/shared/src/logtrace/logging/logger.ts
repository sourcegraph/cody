import { ConsoleLogMessageSink, type LogSink, type LogSinkInput } from './sinks'
export {
    LogSink,
    LogSinkInput,
    ConsoleLogMessageSink,
    SaveLogItemsSink,
} from './sinks'
import { debounce, zip } from 'lodash'
import { IS_TEST, idGenerator } from '../util'
import type { LogItem, LogItemJson } from './items'

const ALREADY_REGISTERED_ERROR = new Error(
    'The logger has already been registered. Make sure you only call `register()` once in your entrypoint'
)

const NOT_REGISTERED_ERROR = new Error(
    'Logger not initialized. Make sure to call `register()` in your entrypoint.'
)

const FLUSH_DEBOUNCE_MS = 100
const FLUSH_MAX_WAIT = 5 * FLUSH_DEBOUNCE_MS

class Logger {
    private _id?: string
    private _session?: string
    private _sinks: Set<LogSink> = new Set()

    private _buffer: LogItem[] = []
    private _jsonBuffer: LogItemJson[] = []

    public push(items: LogItem[]): void {
        //TODO: figure out how we can handle delays in sinks when spans depend on it
        this._buffer = this._buffer.concat(items)
        this._debouncedFlush()
    }

    public pushSerialized(items: LogItemJson[]): void {
        this._jsonBuffer = this._jsonBuffer.concat(items)
        this._debouncedFlush()
    }

    public register(
        id: string,
        defaultSinks: LogSink[] = [new ConsoleLogMessageSink()],
        sessionOverride = idGenerator.next(),
        force = IS_TEST
    ) {
        if (this._id && !force) {
            throw ALREADY_REGISTERED_ERROR
        }
        this._id = id
        this._session = sessionOverride
        this._sinks.clear()
        for (const sink of defaultSinks) {
            this._sinks.add(sink)
        }
        logger = this
    }

    private _flush(): void {
        const itemBuffer = this._buffer
        const jsonBuffer: LogSinkInput[] = this._jsonBuffer
        this._jsonBuffer = []
        this._buffer = []

        const serializedItemBuffer: Array<LogItemJson> = JSON.parse(JSON.stringify(itemBuffer))

        const sinkInputs = jsonBuffer.concat(
            zip(serializedItemBuffer, itemBuffer).map(
                ([serialized, original]) =>
                    Object.assign(serialized!, {
                        original: original!,
                    }) as LogSinkInput
            )
        )

        for (const sink of this._sinks) {
            sink.log(sinkInputs)
        }
    }

    private _debouncedFlush = debounce(this._flush.bind(this), FLUSH_DEBOUNCE_MS, {
        leading: false,
        maxWait: FLUSH_MAX_WAIT,
    })

    public flush(): void {
        this._debouncedFlush.cancel()
        this._flush()
    }

    public get id(): string {
        return this._id! // safe because checkRegistered
    }

    public get session(): string {
        return this._session! // safe because checkRegistered
    }

    public get sinks(): Set<LogSink> {
        return this._sinks
    }
}

class UninitializedLogger extends Logger {
    public register(
        id: string,
        defaultSinks?: LogSink[] | undefined,
        session?: string | undefined,
        _?: boolean
    ) {
        new Logger().register(id, defaultSinks, session, true)
    }

    public push(items: LogItem | LogItem[]): void {
        throw NOT_REGISTERED_ERROR
    }

    public get id(): string {
        throw NOT_REGISTERED_ERROR
    }

    public get session(): string {
        throw NOT_REGISTERED_ERROR
    }

    public get sinks(): Set<LogSink> {
        throw NOT_REGISTERED_ERROR
    }
}

export let logger: Logger = new UninitializedLogger()
