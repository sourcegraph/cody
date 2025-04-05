import type * as vscode from 'vscode'

export const THROTTLE_TIME = 50 as const // ms - standard throttle time for all auto-edits

/**
 * Smart throttle service that manages the frequency of auto-edit requests,
 * balancing responsiveness with avoiding excessive processing.
 */
export class SmartThrottleService {
    public lastRequest: ThrottledRequest | undefined

    /**
     * Check if a request should be throttled based on the last executed request.
     *
     * For the examples below, THROTTLE_TIME = 50ms
     *
     * For auto-edits, a throttle window of 50ms is enforced relative to the last executed
     * auto-edit. When a new request arrives:
     *
     * - If it is user-initiated, from a different document, or in a sufficiently different context,
     *   it executes immediately (Case 1).
     * - Otherwise, the service checks if there is a pending auto-edit (Case 2) or if the last
     *   auto-edit executed but its throttle window is still active (Case 3).
     *
     * Throttle Window (anchored to the last executed request at time T):
     *   [T, T + THROTTLE_TIME] = [T, T + 50ms]
     *
     * CASE 1: Immediate Execution (First Request or User-Initiated)
     * ------------------------------------------------------------
     * No prior pending auto-edit exists (or context differs), so the request executes immediately.
     *
     *   Time (ms):  0                                50ms
     *               |----------------------------------|
     *               Request A executes at t = 0
     *               Throttle window for A: [0, 50ms]
     *
     * CASE 2: New Request Arrives Before Pending Request Execution
     * ------------------------------------------------------------
     * A previous request (A) was already scheduled (but not executed) with a computed delay,
     * meaning its execution is pending. When a new request (B) comes in before A executes,
     * A is aborted and B adopts the same scheduled execution time.
     *
     * Example:
     *   - Suppose a prior auto-edit (A) was scheduled at t = 0 with delayMs = 30ms,
     *     so A is set to execute at t = 30ms.
     *   - Its underlying throttle window is conceptually still based on the last executed time,
     *     say [0, 50ms].
     *   - Request B arrives at t = 20ms (before A’s pending execution).
     *   - New delay for B = A.willBeExecutedAt - now = 30ms - 20ms = 10ms.
     *   - Thus, B will execute at t = 30ms.
     *
     *   Time (ms):  0        10        20        30        40        50
     *               |--------|---------|---------|---------|---------|
     *               ↓                  ↓
     *               Request A          Request B
     *               (pending; scheduled for t = 30ms)
     *               Throttle window for A: [0, 50ms]
     *
     * CASE 3: New Request Arrives After Last Execution but Within Throttle Window
     * ---------------------------------------------------------------------------
     * The previous request (A) has executed, and its throttle window is now active.
     * A new request (B) arriving within this window is delayed until the window expires.
     *
     * Example:
     *   - Request A executes at t = 0 (immediate execution).
     *   - Its throttle window is [0, 50ms].
     *   - Request B arrives at t = 30ms.
     *   - Time since last execution = 30ms.
     *   - Remaining throttle time = THROTTLE_TIME - (30ms) = 20ms.
     *   - B is scheduled with delayMs = 20ms, so it executes at t = 50ms.
     *
     *   Time (ms):  0                                50ms                   100ms
     *               |----------------------------------|
     *               Request A executes at t = 0
     *               Throttle window for A: [0, 50ms]
     *                                  Request B executes at t = 50ms
     *                                  New throttle window for B: [50ms, 100ms]
     */
    public throttle(params: {
        uri: string
        position: vscode.Position
        isManuallyTriggered: boolean
    }): ThrottledRequest {
        const { uri, position, isManuallyTriggered } = params
        const now = performance.now()

        const lastRequest = this.lastRequest
        this.lastRequest = new ThrottledRequest({ uri, position, createdAt: now, delayMs: 0 })

        // CASE 1: First request, different documents, or manually triggered - execute immediately
        if (isManuallyTriggered || !lastRequest || !this.areCloseEnough(lastRequest, params)) {
            lastRequest?.abortController.abort()
            return this.lastRequest
        }

        const timeSinceLastRequestExecution = now - lastRequest.willBeExecutedAt

        if (timeSinceLastRequestExecution <= 0) {
            // CASE 2: We haven't reached the throttle time yet, so abort the last request
            // and delay the new one by the remaining time from the previous request
            lastRequest.abortController.abort()
            this.lastRequest.delayMs = Math.max(0, lastRequest.willBeExecutedAt - now)
        } else {
            // CASE 3: The previous request has completed its throttle window,
            // but we're still within THROTTLE_TIME of it
            // Mark previous as stale and delay the new one by the remaining throttle time
            lastRequest.markAsStale()
            this.lastRequest.delayMs = Math.max(0, THROTTLE_TIME - timeSinceLastRequestExecution)
        }

        return this.lastRequest
    }

    private areCloseEnough(
        lastRequest: { uri: string; position: vscode.Position },
        newRequest: { uri: string; position: vscode.Position }
    ): boolean {
        if (lastRequest.uri !== newRequest.uri) {
            return false
        }

        return newRequest.position.line - lastRequest.position.line <= 1
    }
}

class ThrottledRequest {
    public abortController: AbortController
    public uri: string
    public position: vscode.Position
    public createdAt: number
    public delayMs: number
    public isStale: boolean

    constructor({
        uri,
        position,
        createdAt,
        delayMs,
    }: { uri: string; position: vscode.Position; createdAt: number; delayMs: number }) {
        this.uri = uri
        this.position = position
        this.createdAt = createdAt
        this.delayMs = delayMs
        this.abortController = new AbortController()
        this.isStale = false
    }

    public get willBeExecutedAt() {
        return this.createdAt + this.delayMs
    }

    public abort() {
        this.abortController.abort()
    }

    public markAsStale() {
        this.isStale = true
    }
}
