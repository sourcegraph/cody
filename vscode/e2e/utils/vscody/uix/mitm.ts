import type { UIXContextFnContext } from '.'
import { floorResponseDelayFn } from '../fixture/mitmProxy'

/**
 * Sets a temporary floor response time fn for the duration of the fn block
 * @param ms the floor response time
 */
export async function withFloorResponseTime<T>(
    ms: number,
    { mitmProxy }: Pick<UIXContextFnContext, 'mitmProxy'>,
    fn: () => Promise<T>
) {
    const originalDelay = mitmProxy.options.responseDelay
    mitmProxy.options.responseDelay = floorResponseDelayFn(ms)
    await fn()
    mitmProxy.options.responseDelay = originalDelay
}
