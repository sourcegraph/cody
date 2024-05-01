import type { JsonObject, JsonValue, Jsonifiable } from 'type-fest'
import type { KeysOfUnion } from 'type-fest'
import type { UndefinedToOptional } from 'type-fest/source/internal'
import type { JsonifyObject } from 'type-fest/source/jsonify'
import { monotonicFactory } from 'ulidx'

export const IS_TEST = (typeof process === 'object' && !!process.env.VITEST) ?? false

export const BASE_PATH = (() => {
    if (typeof process !== 'undefined' && process.cwd) {
        // Node.js environment
        return process.cwd()
    }
    if (globalThis.location) {
        // Browser environment
        return globalThis.location.origin
    }
    return ''
})()

class IdGenenrator {
    private _instance = monotonicFactory()
    private _seedTime: number | undefined = undefined

    public setGenerator(
        prng: undefined | (() => number) = undefined,
        seedTime: number | undefined = undefined,
        force = IS_TEST
    ) {
        if (!force) {
            throw new Error(
                'IdGenerator should not be modified outside of test environments or without `force` flag'
            )
        }
        this._seedTime = seedTime
        this._instance = monotonicFactory(prng)
    }

    public next(): string {
        return this._instance(this._seedTime)
    }
}

function defaultDateGenFn() {
    return new Date()
}
class DateGenerator {
    private _instance = defaultDateGenFn
    private _timezoneOffset = defaultDateGenFn().getTimezoneOffset()
    // Useful for testing
    public setDateFn(
        fn: () => Date = defaultDateGenFn,
        timezoneOffset: number | undefined = undefined,
        force = IS_TEST
    ) {
        if (!force) {
            throw new Error(
                'DateGenerator should not be modified outside of test environments or without `force` flag'
            )
        }
        this._instance = fn
        this._timezoneOffset = timezoneOffset ?? fn().getTimezoneOffset()
    }

    public now() {
        return this._instance()
    }

    public get timezoneOffset() {
        return this._timezoneOffset
    }
}

export const dateGenerator = new DateGenerator()
export const idGenerator = new IdGenenrator()

// #region JSON
export type JsonifiableObject = {
    [Key in string]?:
        | Jsonifiable
        | { toJSON: () => Jsonifiable }
        | Array<{ toJSON: () => Jsonifiable }>
        | JsonifiableObject
}

type AllVariantFields<T> = {
    [K in KeysOfUnion<T>]?: never
}

// This field makes sure all fields in the union have a default value of never set.
// This makes it easy to use any field as a discriminant for the union
export type DefaultDiscriminantFields<T extends { _type: string }> = {
    [K in T as K['_type']]: K & Omit<AllVariantFields<T>, keyof K>
}[T['_type']]

// #region Possible Paths
//this type extracts all variants of objects that a key can be. It also takes any variants nested in array types
type UnionKeys<T> = T extends T ? (keyof T extends string | number ? keyof T : never) : never
type AggregateTypes<T, K extends PropertyKey> = T extends any
    ? K extends keyof T
        ? T[K]
        : never
    : never

type AggregatedObjectKeyType<T, K extends PropertyKey> = Extract<AggregateTypes<T, K>, object>
type AggregatedArrayKeyType<T, K extends PropertyKey> = Extract<
    AggregateTypes<T, K>,
    Array<any>
> extends Array<infer AV>
    ? Extract<AV, object>
    : never

/**
 * This bit of typing magic extracts all possible object paths from a heterogenous object.
 * This works even if the object has keys that are of complex union or array types.
 * These keys can be used with the @link{replacePathsIfSet} to substitute values.
 */
export type AllPossiblePaths<T> =
    | `${UnionKeys<T>}`
    | (Extract<T, object> extends any
          ? {
                  [K in UnionKeys<T>]:
                      | `${K}.${AllPossiblePaths<AggregatedObjectKeyType<T, K>>}`
                      | (Extract<T[K], Array<any>> extends Array<infer AV>
                              ? `${K}.[].${AllPossiblePaths<AggregatedArrayKeyType<T, K>>}`
                              : never)
              }[UnionKeys<T>]
          : never)

/**
 * Replace existing values, if they are not undefined/null, at the specified paths with the replacement value.
 * Paths are in the format as allowed by @link{AllPossiblePaths} such as `a.b.[].c`
 */
export function replacePathsIfSet<T extends object>(
    obj: JsonifyObject<UndefinedToOptional<T>>,
    paths: string[],
    replacement: JsonValue | JsonObject
) {
    for (const path of paths) {
        const [head, ...tail] = path.split('.')
        if (!obj || !(head in obj)) {
            continue
        }
        const valueAtKey = (obj as any)?.[head]
        if (tail[0] === '[]') {
            // the key targets array values so we only traverse if the value is actually an array
            if (Array.isArray(valueAtKey)) {
                for (const item of valueAtKey as any[]) {
                    replacePathsIfSet(item, [tail.slice(1).join('.')], replacement)
                }
            }
        } else if (tail?.length > 0) {
            // we need to traverse the object deeper
            replacePathsIfSet(valueAtKey as any, [tail.join('.')], replacement)
        } else if (valueAtKey !== undefined && valueAtKey !== null) {
            console.log(valueAtKey)
            // we found the key
            ;(obj as any)[head] = replacement
        }
    }
    return obj
}
