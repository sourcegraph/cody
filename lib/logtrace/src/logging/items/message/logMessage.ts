import opentelemetry from '@opentelemetry/api'
import type { Jsonify } from 'type-fest'
import type { MessageLogItem } from '../'
import { type AllPossiblePaths, type JsonifiableObject, dateGenerator, idGenerator } from '../../../util'
import { logger } from '../../logger'
import { Callsite } from '../callsite'
import { SpanWrapper } from './wrappers'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'alert', 'panic'] as const

// #region json
/**
 * Severity level.
 *
 * Not necessarily related to verbosity of outputs as each sink decides their own verbosity which could factor in other variables too.
 * Similarly these values can also be used to indicate the importance that certain data fields are included in an output.
 *
 * * debug: Information that is useful for understanding the flow and state of the program to help focus in on where a problem might be ocurring.
 * > Example:  `Starting subsystem X`
 * * info: Information that can help identify flows or states that although within expectations might be good to be aware of.
 * > Example: `logs are written to XXX path`
 * * warn: Information that can help identify flows or states that are outside the usual bounds of operation
 * > Example: `Embeddings are disabled because no model was found`
 * * alert: Information that indicates flows or states that partially impact normal functionality
 * > Example: `Config file corrupted. Loading defaults`
 * * panic: Information that indicates flows or states that severly impact normal functionality
 * > Example: `Agent could not be started`
 */
export type LogLevel = (typeof LOG_LEVELS)[number]

const DEFAULT_CALLSITE_DEPTH = 2 //TODO: Check this and verify that it's the same for both ways log can be called
export function log(message: LogMessage<Readonly<[]>>, opts?: MessageWithoutDataOptions): void
export function log<M = any>(
    message: M extends LogMessage<any> ? M : never,
    opts: M extends LogMessage<infer LV>
        ? MessageWithDataOptions<`msg.${Exclude<keyof Readonly<LV>, keyof any[]> & string}`>
        : never
): void
export function log<M = any, D = any>(
    message: M extends LogMessage<any> ? M : never,
    data: D extends JsonifiableObject ? D : never,
    opts: M extends LogMessage<infer LV>
        ? MessageWithDataOptions<
              | `data.${AllPossiblePaths<Jsonify<D>>}`
              | `msg.${Exclude<keyof Readonly<LV>, keyof any[]> & string}`
          >
        : never
): void
export function log(
    message: LogMessage,
    dataOrOpts?: MessageOptions | JsonifiableObject,
    maybeOpts?: MessageOptions
): void {
    // if data is defined as "data" then opts must be set.
    const data = maybeOpts !== undefined ? (dataOrOpts as JsonifiableObject) : undefined
    const opts = maybeOpts !== undefined ? (dataOrOpts as MessageOptions) : maybeOpts

    const callsiteDepth = (opts?.callsite || 0) + DEFAULT_CALLSITE_DEPTH
    const callsite = !opts?.callsite !== false ? new Callsite(callsiteDepth) : undefined
    const activeSpan = opentelemetry.trace.getActiveSpan()
    //todo: add named values to the data
    const item: MessageLogItem = {
        _type: 'MessageLogItem',
        id: idGenerator.next(),
        level: 'alert',
        timestamp: {
            datetime: dateGenerator.now(),
            timezoneOffset: dateGenerator.timezoneOffset,
        },
        origin: {
            id: logger.id,
            session: logger.session,
            callsite: callsite,
        },
        trace: SpanWrapper.wrap(activeSpan) ?? undefined,
        message,
        verbose: opts?.verbose,
        visibility: opts?.privateExcept
            ? { privateExcept: opts.privateExcept }
            : opts?.publicExcept
              ? { publicExcept: opts.publicExcept }
              : { privateExcept: [] },
        data: data ?? {},
        tags: opts?.tags,
    }

    logger.push(item)
}

export type MessageOptions = MessageWithoutDataOptions | MessageWithDataOptions

interface MessageBaseOptions {
    /**
     * Number of (additional) stack frames to skip when determining the callsite
     */
    callsite?: number | false

    /**
     * Tags can be used to identify different log messages related to a single
     * piece of functionality. For example there might be several components
     * across agent and client involved in an auth system. All of them could tag
     * these messages with an 'auth' tag to more easily find them later
     */
    tags?: string[]
}

type MessageWithoutDataOptions = MessageBaseOptions & {
    publicExcept?: never
    privateExcept?: never
    verbose?: never
}
type MessageWithDataOptions<K extends string = string> = MessageBaseOptions & {
    verbose?: K[]
} & (
        | {
              publicExcept: K[]
              privateExcept?: never
          }
        | { publicExcept?: never; privateExcept: K[] }
    )

type AllowedPrimitiveLogMessageValues = number | boolean | string | Date
type AllowedLogMessageValues = AllowedPrimitiveLogMessageValues | Array<AllowedPrimitiveLogMessageValues>
export type LogMessageValues = ReadonlyArray<AllowedLogMessageValues>
export interface LogMessage<V extends LogMessageValues = any> {
    level: LogLevel
    template: TemplateStringsArray
    vars: V
}

export function debug<V extends LogMessageValues>(
    template: TemplateStringsArray,
    ...vars: V
): LogMessage<V> {
    return {
        level: 'debug',
        template,
        vars,
    }
}

export function info<V extends LogMessageValues>(
    template: TemplateStringsArray,
    ...vars: V
): LogMessage<V> {
    return {
        level: 'info',
        template,
        vars,
    }
}

export function warn<V extends LogMessageValues>(
    template: TemplateStringsArray,
    ...vars: V
): LogMessage<V> {
    return {
        level: 'warn',
        template,
        vars,
    }
}

export function alert<V extends LogMessageValues>(
    template: TemplateStringsArray,
    ...vars: V
): LogMessage<V> {
    return {
        level: 'alert',
        template,
        vars,
    }
}

export function panic<V extends LogMessageValues>(
    template: TemplateStringsArray,
    ...vars: V
): LogMessage<V> {
    return {
        level: 'panic',
        template,
        vars,
    }
}
