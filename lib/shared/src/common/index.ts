// TODO(sqs): copied from sourcegraph/sourcegraph. should dedupe.

interface ErrorLike {
    message: string
    name?: string
}

export const isErrorLike = (value: unknown): value is ErrorLike =>
    typeof value === 'object' && value !== null && ('stack' in value || 'message' in value) && !('__typename' in value)

/**
 * Returns true if `val` is not `null` or `undefined`
 */
export const isDefined = <T>(value: T): value is NonNullable<T> => value !== undefined && value !== null

/**
 * Returns the last element of path, or "." if path is empty.
 */
export function basename(path: string): string {
    return path.split('/').at(-1) || '.'
}

export function pluralize(string: string, count: number | bigint, plural = string + 's'): string {
    return count === 1 || count === 1n ? string : plural
}

/**
 * Return a filtered version of the given array, de-duplicating items based on the given key function.
 * The order of the filtered array is not guaranteed to be related to the input ordering.
 */
export const dedupeWith = <T>(items: T[], key: keyof T | ((item: T) => string)): T[] => [
    ...new Map(items.map(item => [typeof key === 'function' ? key(item) : item[key], item])).values(),
]
