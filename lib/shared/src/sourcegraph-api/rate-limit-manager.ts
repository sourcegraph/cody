import { differenceInDays, format, formatDistanceStrict, formatRelative } from 'date-fns'

// Singleton to manage rate limits across the application
export class RateLimitManager {
    private static instance: RateLimitManager
    private timeouts: Map<string, NodeJS.Timeout> = new Map()
    private listeners: Map<string, Set<() => void>> = new Map()

    private constructor() {}

    public static getInstance(): RateLimitManager {
        if (!RateLimitManager.instance) {
            RateLimitManager.instance = new RateLimitManager()
        }
        return RateLimitManager.instance
    }

    public scheduleReset(feature: string, retryAfterDate: Date): void {
        const now = new Date()
        const timeToWait = Math.max(0, retryAfterDate.getTime() - now.getTime())

        // Clear existing timeout if any
        this.clearTimeout(feature)

        // Set new timeout
        const timeout = setTimeout(() => {
            console.log(`Rate limit reset for ${feature}`)
            reenableModels(feature)
            this.notifyListeners(feature)
            this.timeouts.delete(feature)
        }, timeToWait)

        this.timeouts.set(feature, timeout)
    }

    public clearTimeout(feature: string): void {
        const timeout = this.timeouts.get(feature)
        if (timeout) {
            clearTimeout(timeout)
            this.timeouts.delete(feature)
        }
    }

    public addResetListener(feature: string, callback: () => void): void {
        if (!this.listeners.has(feature)) {
            this.listeners.set(feature, new Set())
        }
        this.listeners.get(feature)?.add(callback)
    }

    public removeResetListener(feature: string, callback: () => void): void {
        this.listeners.get(feature)?.delete(callback)
    }

    private notifyListeners(feature: string): void {
        const listeners = this.listeners.get(feature)
        if (listeners) {
            for (const callback of listeners) {
                callback()
            }
        }
    }

    // Clean up all timeouts (useful for testing or app shutdown)
    public dispose(): void {
        for (const timeout of this.timeouts.values()) {
            clearTimeout(timeout)
        }
        this.timeouts.clear()
        this.listeners.clear()
    }
}

// Helper function to format retry message
export function formatRetryAfterDate(retryAfterDate: Date): string {
    const now = new Date()
    if (differenceInDays(retryAfterDate, now) < 7) {
        return `Usage will reset ${formatRelative(retryAfterDate, now)}`
    }
    return `Usage will reset in ${formatDistanceStrict(retryAfterDate, now)} (${format(
        retryAfterDate,
        'P'
    )} at ${format(retryAfterDate, 'p')})`
}

/**
 * Re-enables all models that were disabled due to rate limiting.
 * This is called automatically when the retry-after period expires.
 */
function reenableModels(feature: string): void {
    console.log(`[Cody] Rate limit period expired for ${feature}. Re-enabling models.`)

    // For Agentic Chat feature, we need to reset the rate limit in the ToolboxManager
    if (feature === 'Agentic Chat' && typeof require !== 'undefined') {
        try {
            // Dynamically import to avoid circular dependencies
            const { toolboxManager } = require('../../vscode/src/chat/agentic/ToolboxManager')
            if (toolboxManager) {
                toolboxManager.setIsRateLimited(false)
                console.log('[Cody] Successfully re-enabled DeepCody models in ToolboxManager')
            }
        } catch (error) {
            console.error('[Cody] Failed to re-enable models in ToolboxManager:', error)
        }
    }

    // Update the authStatus to remove the rate limit for this feature
    try {
        const { currentAuthStatusOrNotReadyYet, mockAuthStatus } = require('../auth/authStatus')
        const currentStatus = currentAuthStatusOrNotReadyYet()
        if (currentStatus?.authenticated && currentStatus.rateLimited) {
            // Create a new auth status object with the rate limit for this feature removed
            const updatedRateLimited = { ...currentStatus.rateLimited }
            delete updatedRateLimited[feature]

            // If there are no more rate limited features, remove the rateLimited property entirely
            const updatedStatus: typeof currentStatus = {
                ...currentStatus,
                rateLimited: Object.keys(updatedRateLimited).length > 0 ? updatedRateLimited : undefined,
            }

            console.log(`[Cody] Updating auth status to remove rate limit for ${feature}`)
            mockAuthStatus(updatedStatus)

            // This will trigger syncModels to re-enable the models since the authStatus has changed
            console.log('[Cody] Auth status updated, models will be re-enabled via syncModels')
        }
    } catch (error) {
        console.error('[Cody] Failed to update auth status to remove rate limit:', error)
    }

    // Emit an event that can be listened to by various components
    // to re-enable their models
    if (typeof window !== 'undefined') {
        const event = new CustomEvent('cody:rate-limit-expired', {
            detail: {
                feature: feature,
                timestamp: new Date(),
            },
        })
        window.dispatchEvent(event)
    } else if (typeof process !== 'undefined') {
        // For Node.js environments, use EventEmitter pattern
        // We need to use a proper Node.js event emitter
        // This will need to be handled by components that want to listen for this event
        console.log(
            `[Cody] Rate limit period expired for ${feature}. Components should check for re-enabling.`
        )
        // Notify any listeners through a global event bus if available
        if (typeof global !== 'undefined' && (global as any).codyEventBus) {
            ;(global as any).codyEventBus.emit('rate-limit-expired', {
                feature: feature,
                timestamp: new Date(),
            })
        }
    }
}
