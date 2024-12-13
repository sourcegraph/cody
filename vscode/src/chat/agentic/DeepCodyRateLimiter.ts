import { RateLimitError } from '@sourcegraph/cody-shared'
import { localStorage } from './../../services/LocalStorageProvider'

/**
 * NOTE: This is a temporary rate limit for deep-cody models to prevent users from
 * running into rate limits that block them from using Cody.
 * We should remove this once we have a more robust solution in place.
 * Any first 2 human messages submitted with Deep Cody is counted toward the usage.
 */
export class DeepCodyRateLimiter {
    private readonly ONE_DAY_MS = 24 * 60 * 60 * 1000

    constructor(
        private readonly baseQuota: number = 0,
        private readonly multiplier: number = 1
    ) {}

    /**
     * Returns the number of seconds the user needs to wait before they can use DeepCody again.
     */
    public isAtLimit(): string | undefined {
        const DAILY_QUOTA = this.baseQuota * this.multiplier

        // If there is no quota set, there is no limit.
        if (!DAILY_QUOTA) {
            return undefined
        }

        // Get current quota and last used time, with defaults
        const { quota, lastUsed } = localStorage.getDeepCodyUsage()
        const currentQuota = quota ?? DAILY_QUOTA
        const lastUsedTime = lastUsed.getTime()

        const now = new Date().getTime()
        const timeDiff = now - lastUsedTime

        // Calculate quota replenishment based on time passed
        const quotaToAdd = DAILY_QUOTA * (timeDiff / this.ONE_DAY_MS)
        const newQuota = Math.min(DAILY_QUOTA, currentQuota + quotaToAdd)

        // If we have at least 1 quota available
        if (newQuota >= 1) {
            // Update quota and timestamp
            localStorage?.setDeepCodyUsage(newQuota - 1, new Date().toISOString())
            return undefined
        }

        // No quota available.
        // Calculate how much time after the lastUsedTime we need to wait.
        const timeToWait = this.ONE_DAY_MS - timeDiff
        return Math.floor(timeToWait / 1000).toString()
    }

    public getRateLimitError(retryAfter: string): RateLimitError {
        return new RateLimitError('Deep Cody', 'daily limit', false, undefined, retryAfter)
    }
}
