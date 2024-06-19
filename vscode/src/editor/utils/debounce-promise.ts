import { debounce } from 'lodash'

export function debouncePromise<T extends (...args: any) => Promise<any>, B>(
    func: T,
    debounceDelay?: number
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | 'skipped'> {
    const promiseResolverRef: { current: (b: Awaited<ReturnType<T>> | 'skipped') => void } = {
        current: () => {},
    }

    const debouncedFunc = debounce((...args: any) => {
        const promiseResolverSnapshot = promiseResolverRef.current
        func(...args).then(b => {
            if (promiseResolverSnapshot === promiseResolverRef.current) {
                promiseResolverRef.current(b)
            }
        })
    }, debounceDelay)

    return (...args: any) =>
        new Promise<Awaited<ReturnType<T>> | 'skipped'>(resolve => {
            promiseResolverRef.current('skipped')
            promiseResolverRef.current = resolve

            debouncedFunc(...args)
        })
}
