import type { Jsonify } from 'type-fest'
import type { DefaultDiscriminantFields, JsonifiableObject } from '../../util'
import type { Callsite } from './callsite'
import type { LogLevel, LogMessage, LogMessageValues, SpanWrapper } from './message'

//TODO(rnauta): handle promises as data?

///* "Fully" Discriminative Union
type LogItemVariants = StateLogItem | MessageLogItem | TraceLogItem | EventLogItem
type LogItemVariantsJson = Jsonify<StateLogItem> | Jsonify<MessageLogItem>

export type LogItem = DefaultDiscriminantFields<LogItemVariants>
export type LogItemJson = DefaultDiscriminantFields<LogItemVariantsJson>

interface BaseLogItem {
    _type: LogItemVariants['_type']
    id: string
    origin: Origin
    timestamp: Timestamp
}

interface Timestamp {
    datetime: Date
    /**
     * The timezone offset helps anchor any other date-times that might have
     * been serialized as by default the `toJSON` of `Date` does not include the
     * timezone.
     */
    timezoneOffset: number
}

interface Origin {
    id: string
    session: string
    callsite?: Callsite
}

export interface MessageLogItem<
    V extends LogMessageValues = any,
    D extends JsonifiableObject | unknown = any,
> extends BaseLogItem {
    _type: 'MessageLogItem'
    level: LogLevel
    message: LogMessage<V>
    visibility?:
        | {
              publicExcept: string[]
              privateExcept?: never
          }
        | { privateExcept: string[]; publicExcept?: never }
    verbose?: string[]
    trace?: SpanWrapper
    tags?: string[]
    data: D
}

export interface StateLogItem extends BaseLogItem {
    _type: 'StateLogItem'
    root: string
}

export interface TraceLogItem extends BaseLogItem {
    _type: 'TraceLogItem'
}

export interface EventLogItem extends BaseLogItem {
    _type: 'BaseLogItem'
}
