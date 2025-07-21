import { useCallback, useRef } from 'react'

type RefStateAPI<T> = [{ current: T }, () => T]

/**
 * Wraps any arbitrary data with reference based state which doesn't
 * trigger any dependencies lists (useMemo, useCallback, ...etc) between
 * renders calls.
 *
 * @param value
 */
export function useRefState<T>(value: T): RefStateAPI<T> {
    const ref = useRef<T>(value)

    ref.current = value

    return [ref, useCallback(() => ref.current, [])]
}
