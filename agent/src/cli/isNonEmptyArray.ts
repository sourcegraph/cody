export function isNonEmptyArray<T>(arr: undefined | null | T[]): arr is T[] {
    return Array.isArray(arr) && arr.length > 0
}
