import 'source-map-support/register' //TODO(rnauta): check that this works post build
export {
    logger,
    ConsoleLogMessageSink,
    SaveLogItemsSink,
    alert,
    debug,
    info,
    panic,
    log,
    warn,
    LogLevel,
    LogSink,
    LogSinkInput,
    TraceSpanErrorSink,
    TraceSpanErrorSinkOptions,
    LogMessage,
} from './logging'
export * from './logging/items'
export {} from './logging/items/message'
