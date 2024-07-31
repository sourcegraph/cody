import { useEffect, useState } from 'react'

/**
 * React hook to return the latest value and complete/error state from an AsyncGenerator.
 *
 * The AsyncGenerator is obtained by calling {@link factory} so that its execution can be aborted
 * when the hook is unmounted, to avoid resource leaks.
 */
export function useAsyncGenerator<T>(factory: (signal: AbortSignal) => AsyncGenerator<T>): {
    value: T | undefined
    complete: boolean
    error: Error | null
} {
    const [state, setState] = useState<{
        value: T | undefined
        complete: boolean
        error: Error | null
    }>({
        value: undefined,
        complete: false,
        error: null,
    })

    useEffect(() => {
        let isMounted = true
        const abortController = new AbortController()
        const generator = factory(abortController.signal)

        async function run() {
            try {
                for await (const value of generator) {
                    if (!isMounted) break
                    setState({ value, complete: false, error: null })
                }
                if (isMounted) {
                    setState(prevState => ({ ...prevState, complete: true }))
                }
            } catch (error) {
                if (isMounted) {
                    setState(prevState => ({ ...prevState, error: error as Error }))
                }
            }
        }
        run()

        return () => {
            isMounted = false
            abortController.abort()
        }
    }, [factory])

    return state
}
