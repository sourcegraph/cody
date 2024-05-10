import type { Jsonify } from 'type-fest'
import { isDefined } from '../../../common'
import { type DefaultDiscriminantFields, type JsonifiableObject, withPathsReplaced } from '../../util'
import type { Callsite } from './callsite'
import type { LogLevel, LogMessage, LogMessageValues, SpanWrapper } from './message'

//TODO(rnauta): handle promises as data?

///* "Fully" Discriminative Union
type LogItemVariants = StateLogItem | MessageLogItem | TraceLogItem | EventLogItem
type LogItemVariantsJson = StateLogItemJson | MessageLogItemJson | TraceLogItemJson | EventLogItemJson

export type LogItem = DefaultDiscriminantFields<LogItemVariants>
export type LogItemJson = DefaultDiscriminantFields<LogItemVariantsJson>

interface BaseLogItem {
    _type: LogItemVariants['_type']
    id: string
    origin: Origin
    timestamp: Timestamp
}

export interface Timestamp {
    datetime: Date
    /**
     * The timezone offset helps anchor any other date-times that might have
     * been serialized as by default the `toJSON` of `Date` does not include the
     * timezone.
     */
    timezoneOffset: number
}

export interface Origin {
    id: string
    session: string
    callsite?: Callsite
}

export type MessageLogItemVisibility =
    | {
          publicExcept: string[]
          privateExcept?: never
      }
    | { privateExcept: string[]; publicExcept?: never }

export interface MessageLogItem<
    V extends LogMessageValues = any,
    D extends JsonifiableObject | unknown = any,
> extends BaseLogItem {
    _type: 'MessageLogItem'
    level: LogLevel
    message: LogMessage<V>
    visibility?: MessageLogItemVisibility
    data: D
    verbose?: string[]
    trace?: SpanWrapper
    tags?: string[]
}

export type MessageLogItemJson = Jsonify<MessageLogItem>

export interface StateLogItem extends BaseLogItem {
    _type: 'StateLogItem'
    root: string
}

export type StateLogItemJson = Jsonify<StateLogItem>

export interface TraceLogItem extends BaseLogItem {
    _type: 'TraceLogItem'
}

export type TraceLogItemJson = Jsonify<TraceLogItem>

export interface EventLogItem extends BaseLogItem {
    _type: 'EventLogItem'
}

export type EventLogItemJson = Jsonify<EventLogItem>

// #region: Namespace Helpers

export namespace MessageLogItem {
    export function formatMessage(
        item: (Pick<MessageLogItem, 'message'> | Pick<MessageLogItemJson, 'message'>) &
            Pick<MessageLogItem, 'visibility'>
    ): string {
        //TODO(rnauta): apply visibility constraints
        return item.message.template.reduce(
            (acc, part, i) => acc + part + (item.message.vars[i] ?? ''),
            ''
        )
    }

    export function maskData<D extends JsonifiableObject | unknown>(
        item: // | Pick<MessageLogItem, "data" | "visibility" | "verbose">
        Pick<MessageLogItem, 'data' | 'visibility' | 'verbose'> & Pick<MessageLogItemJson, 'data'>
    ): D {
        const visibilityKeys =
            item.visibility?.publicExcept ?? item.visibility?.privateExcept ?? undefined

        let outputData = item.data

        if (visibilityKeys) {
            const dataKeys = visibilityKeys
                .map(key => (key.startsWith('data') ? key.replace('data.', '') : null))
                .filter(isDefined)

            outputData = withPathsReplaced(outputData, dataKeys, '***REDACTED***')
        }
        //TODO(rnauta): alter behaviour depending on if it's visibile/hidden by default
        const verboseDataKeys = (item.verbose ?? [])
            .map(key => (key.startsWith('data') ? key.replace('data.', '') : null))
            .filter(isDefined)
        if (verboseDataKeys.length > 0) {
            outputData = withPathsReplaced(outputData, verboseDataKeys, '...')
        }

        return outputData
    }
}
