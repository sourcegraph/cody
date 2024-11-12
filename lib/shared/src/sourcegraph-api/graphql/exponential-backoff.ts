import { Observable } from 'observable-fns'
import { logDebug } from '../../logger'

/**
 * Creates an Observable that can be used to retry operations that may fail with
 * transient errors. The observable emits a value, after a delay, when it is
 * time to retry. Use one exponentialBackoffRetry per operation you want to
 * attempt.
 *
 * @param options configures the rate of exponential backoff.
 * @returns an Observable which emits an ExponentialBackoffTimer and a retry
 * counter.
 * @see ExponentialBackoffTimer
 */
export function exponentialBackoffRetry(
    options: ExponentialBackoffRetryOptions
): Observable<{ retry: ExponentialBackoffTimer; retryCount: number }> {
    return new Observable(observer => {
        const timer = new (class extends ExponentialBackoffTimer {
            run(retryCount: number) {
                observer.next({ retry: this, retryCount: retryCount })
            }
            override success() {
                observer.complete()
            }
        })(options)
        observer.next({ retry: timer, retryCount: 0 })
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

    protected abstract run(retryCount: number): void

    success() {
        this[Symbol.dispose]()
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
            this.run(this.retryCount)
        }, delayMsec)
        this.retryTimer = retryTimer
        this.retryCount++
    }
}
