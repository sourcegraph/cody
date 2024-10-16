export function getFirstOrValue<T>(input: T | Array<T>): T {
    return Array.isArray(input) ? input[0] : input
}

type FixedLengthTuple<T, N extends number, R extends readonly T[] = []> = R['length'] extends N
    ? R
    : FixedLengthTuple<T, N, readonly [T, ...R]>

/**
 * Returns the lower bound + offset or errors if the number is outside of the range
 */
export function rangeOffset<LENGTH extends number = number>(
    offset: [number, LENGTH],
    range: [number, number]
): FixedLengthTuple<number, LENGTH>
export function rangeOffset(offset: number, range: [number, number]): number
export function rangeOffset(
    _offset: number | [number, number],
    range: [number, number]
): number | number[] {
    const [offset, take] = Array.isArray(_offset) ? _offset : [_offset, -1]
    const anchor = range[0] + offset
    if (take < 0) {
        return anchor
    }
    return Array.from({ length: take }, (_, i) => anchor + i)
}
