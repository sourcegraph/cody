import { Observable } from 'observable-fns'
import { logDebug } from '../../logger'

/**
 * Creates an Observable that can be used to retry operations that may fail with
 * transient errors. The observable emits a value, after a delay, when it is
 * time to retry.
 *
 * @param options configures the rate of exponential backoff.
 * @returns an Observable which emits an ExponentialBackoffTimer and an
 * attempt and retry counter.
 * @see ExponentialBackoffTimer
 */
export function exponentialBackoffRetry(
    options: ExponentialBackoffRetryOptions
): Observable<{ retry: ExponentialBackoffTimer; iteration: number; retryCount: number }> {
    return new Observable(observer => {
        const timer = new (class extends ExponentialBackoffTimer {
            run(successCount: number, retryCount: number) {
                observer.next({ retry: this, iteration: successCount, retryCount: retryCount })
            }
        })(options)
        observer.next({ retry: timer, iteration: 0, retryCount: 0 })
        return () => timer[Symbol.dispose]()
    })
}

export type ExponentialBackoffRetryOptions = {
    label: string
    maxRetries: number
    initialDelayMsec: number
    backoffFactor: number
}

export abstract class ExponentialBackoffTimer {
    private readonly label: string
    private readonly maxRetries: number
    private readonly initialDelayMsec: number
    private readonly backoffFactor: number
    private successCount = 0
    private retryCount = 0
    private retryTimer: NodeJS.Timeout | undefined

    constructor(options: ExponentialBackoffRetryOptions) {
        this.label = options.label
        this.maxRetries = options.maxRetries
        this.initialDelayMsec = options.initialDelayMsec
        this.backoffFactor = options.backoffFactor
    }

    [Symbol.dispose]() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
            this.retryTimer = undefined
        }
    }

    protected abstract run(successCount: number, retryCount: number): void

    success() {
        this.successCount++
        this.retryCount = 0
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
            this.retryTimer = undefined
        }
    }

    failure(error: Error) {
        if (this.retryTimer) {
            return
        }
        if (this.retryCount >= this.maxRetries) {
            throw error
        }
        const delayMsec = this.initialDelayMsec * this.backoffFactor ** this.retryCount
        logDebug(this.label, `will retry after ${Math.round(delayMsec)}ms caused by ${error.message}`)
        const retryTimer = setTimeout(() => {
            if (this.retryTimer !== retryTimer) {
                return
            }
            this.retryTimer = undefined
            this.run(this.successCount, this.retryCount)
        }, delayMsec)
        this.retryTimer = retryTimer
        this.retryCount++
    }
}
