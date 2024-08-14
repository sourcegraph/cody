import { useEffect, useRef, useState } from 'react'

export type UseAsyncGeneratorResult<T> = {
    /**
     * The last value from the AsyncGenerator, or `undefined` if no value has been emitted yet.
     *
     * It is not possible in this API to differentiate "no value emitted yet" from "value
     * `undefined` emitted".
     */
    value: T | undefined
} & (
    | {
          done: false
          error: null
      }
    | {
          done: true
          error: Error | null
      }
)

const INITIAL: UseAsyncGeneratorResult<any> = {
    value: undefined,
    done: false,
    error: null,
}

/**
 * React hook to return the latest value and complete/error state from an AsyncGenerator.
 *
 * The AsyncGenerator is obtained by calling {@link factory} so that its execution can be aborted
 * when the hook is unmounted, to avoid resource leaks.
 */
export function useAsyncGenerator<T>(
    factory: (signal: AbortSignal) => AsyncGenerator<T>,
    options?: {
        /**
         * By default, the prior result value will be reused even if `factory` changes, until the
         * next value is emitted. If `preserveValueKey` is set, then the prior result value will be
         * discarded if the current `preserveValueKey` value differs from the previous one.
         */
        preserveValueKey?: string | number
    }
): UseAsyncGeneratorResult<T> {
    const [state, setState] = useState<UseAsyncGeneratorResult<T>>(INITIAL)

    const lastPreserveValueKey = useRef(options?.preserveValueKey ?? undefined)

    useEffect(() => {
        let isMounted = true
        const abortController = new AbortController()

        if (lastPreserveValueKey.current !== options?.preserveValueKey) {
            setState(INITIAL)
            lastPreserveValueKey.current = options?.preserveValueKey
        }

        async function run() {
            try {
                const generator = factory(abortController.signal)
                for await (const value of generator) {
                    if (!isMounted) break
                    setState({ value, done: false, error: null })
                }
                if (isMounted) {
                    setState(prevState => ({ ...prevState, done: true }))
                }
            } catch (error) {
                if (isMounted) {
                    setState(prevState => ({ ...prevState, done: true, error: error as Error }))
                }
            }
        }
        run()

        return () => {
            isMounted = false
            abortController.abort()
        }
    }, [factory, options?.preserveValueKey])

    return state
}

export function waitForAsyncGeneratorInTest(): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve)
    })
}
