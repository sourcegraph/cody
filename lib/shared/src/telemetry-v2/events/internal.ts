import type { LiteralUnion } from 'type-fest'
import { logError } from '../../logger'
declare const fallbackVariant: unique symbol
// we disguise the fallbackValue as a tagged string so that it can be exported as a type
export const fallbackValue = '__fallback__' as const
export type MapperInput = { [key: string]: number } & (
    | { [fallbackValue]: number }
    | { [fallbackValue]?: never }
)

export type MapperInputs = Record<string, MapperInput>

type ObjWithFallback<T extends Record<string, number>> = T & {
    [fallbackValue]?: number
}
type KeyOfOmitFallback<T> = T extends ObjWithFallback<infer U> ? keyof U : never

type HasFallback<M extends MapperInput> = M extends { [fallbackValue]: infer V }
    ? V extends number
        ? true
        : false
    : false
export type MapperFn<M extends MapperInput> = HasFallback<M> extends true
    ? (v: LiteralUnion<KeyOfOmitFallback<M>, string>) => number
    : <
          V extends LiteralUnion<KeyOfOmitFallback<M>, string> = LiteralUnion<
              KeyOfOmitFallback<M>,
              string
          >,
      >(
          v: V
      ) => V extends KeyOfOmitFallback<M> ? number : null

export type MapperFns<M extends MapperInputs> = {
    [K in keyof M]: MapperFn<M[K]>
}
export type Unmapped<M extends MapperInput, Strict extends boolean = false> = Strict extends true
    ? KeyOfOmitFallback<M>
    : LiteralUnion<KeyOfOmitFallback<M>, string>

type SplitSignature<S extends string, D extends string = '/'> = string extends S
    ? string[]
    : S extends ''
      ? []
      : S extends `${infer T}${D}${infer U}`
        ? [T, ...SplitSignature<U, D>]
        : [S]

function splitSignature<const S extends string>(sig: S): SplitSignature<S, '/'> {
    return sig.split('/') as SplitSignature<S>
}

export function event<
    Signature extends `${string}/${string}`,
    M extends MapperInputs,
    Args extends readonly unknown[],
>(
    featureAction: Signature,
    record: (ctx: {
        maps: M
        map: MapperFns<M>
        feature: SplitSignature<Signature>[0]
        action: SplitSignature<Signature>[1]
    }) => (...args: Args) => void,
    maps: M
) {
    const [feature, action] = splitSignature(featureAction)
    //TODO: Make type-safe
    const map = new Proxy(maps, {
        get(target, p) {
            const mapping = target[p as keyof M]
            return (v: any) => mapping[v] ?? mapping[fallbackValue] ?? null
        },
    }) as unknown as MapperFns<M>
    const ctx = {
        map,
        maps,
        featureAction,
        feature,
        action,
    }
    // we wrap the record Fn so that errors never break the execution
    // but instead are just logged. Tests should catch these events.
    const wrappedRecord = (...args: Args) => {
        const fn = record(ctx)
        const handleError = (e: any) => {
            logError('Telemetry Recording', 'Failed to record telemetry event', {
                error: e,
            })
        }
        try {
            fn(...args)
        } catch (e) {
            handleError(e)
        }
    }
    const out = {
        ctx,
        record: wrappedRecord,
    } as const
    return [featureAction, out] as const
}

type PickDefined<T> = {
    [K in keyof T]-?: T[K] extends undefined ? never : T[K] extends infer U | undefined ? U : T[K]
}

/**
 * Only omit undefined keys. Null keys are not omitted so that the mappers still
 * give type errors in case no default value is provided
 */
export function pickDefined<T>(obj: T): PickDefined<T> {
    const result: any = {}
    for (const key in obj) {
        const value = obj[key]
        if (value !== undefined) {
            result[key] = value
        }
    }
    return result
}
