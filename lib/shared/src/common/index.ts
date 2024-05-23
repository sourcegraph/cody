// TODO(sqs): copied from sourcegraph/sourcegraph. should dedupe.

interface ErrorLike {
    message: string
    name?: string
}

export const isErrorLike = (value: unknown): value is ErrorLike =>
    typeof value === 'object' &&
    value !== null &&
    ('stack' in value || 'message' in value) &&
    !('__typename' in value)

/**
 * Returns true if `val` is not `null` or `undefined`
 */
export const isDefined = <T>(value: T): value is NonNullable<T> => value !== undefined && value !== null

export function pluralize(string: string, count: number | bigint, plural = `${string}s`): string {
    return count === 1 || count === 1n ? string : plural
}

/**
 * Return a filtered version of the given array, de-duplicating items based on the given key function.
 */
export const dedupeWith = <T>(items: T[], key: keyof T | ((item: T) => string)): T[] => {
    const seen = new Set()
    const isKeyFunction = typeof key === 'function'

    return items.reduce((result, item) => {
        const itemKey = isKeyFunction ? key(item) : item[key]

        if (!seen.has(itemKey)) {
            seen.add(itemKey)
            result.push(item)
        }

        return result
    }, [] as T[])
}
