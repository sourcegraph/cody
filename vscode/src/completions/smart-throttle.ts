import { TriggerKind } from './get-inline-completions'
import type { RequestParams } from './request-manager'
import { forkSignal, sleep } from './utils'
import type * as vscode from 'vscode'

const SMART_THROTTLE_WINDOWS = 200

// A smart throttle service for autocomplete requests. The idea is to move beyond a simple debounce
// based timeout and start a bunch of requests immediately. Additionally, we also want to be more
// eager in cancelling autocomplete requests.
//
// For the smart service, there are three types of autocomplete requests:
//
//   1. Those at the start of a line (when the currentLinePrefix is only whitespace)
//   2. The latest request (tail)
//   3. As well as one throttled by a timeout or number of characters.
export class SmartThrottleService implements vscode.Disposable {
    // The latest start-of-line request. Will be cancelled when a new start-of-line request is
    // enqueued.
    private startOfLineRequest: null | ThrottledRequest = null
    // The latest tail request. Will be cancelled when a new tail request is enqueued unless
    // upgraded to a throttled request.
    private tailRequest: null | ThrottledRequest = null
    // The timestamp when the latest tail request was prompted to a throttled-request. When it
    // exceeds the throttle timeout, a tail request will be promoted again.
    private lastThrottlePromotion = 0

    async throttle(request: RequestParams, triggerKind: TriggerKind): Promise<RequestParams | null> {
        const throttledRequest = new ThrottledRequest(request)
        const now = Date.now()

        // Case 1: If this is a start-of-line request, cancel any previous start-of-line requests
        //         and immediately continue with the execution.
        if (this.isStartOfLineRequest(request)) {
            this.startOfLineRequest?.abort()
            this.startOfLineRequest = throttledRequest

            // When a start-of-line request is started, we also want to increment the last throttled
            // request timer. This is to ensure that, on a new line, the very next keystroke does
            // not get prompted into a kept-alive request yet.
            this.lastThrottlePromotion = now

            return throttledRequest.updatedRequestParams()
        }

        // Case 2: The last throttled promotion is more than the throttle timeout ago. In this case,
        //         promote the last tail request to a throttled request and continue with the third
        //         case.
        if (now - this.lastThrottlePromotion > SMART_THROTTLE_WINDOWS && this.tailRequest) {
            // Setting tailRequest to null will make sure the throttled request can no longer be
            // cancelled by this logic.
            this.tailRequest = null
            this.lastThrottlePromotion = now
        }

        // Case 3: Handle the latest request as the new tail request and require a small debounce
        //         time before continuing.
        this.tailRequest?.abort()
        this.tailRequest = throttledRequest
        const newRequestParams = throttledRequest.updatedRequestParams()

        if (triggerKind === TriggerKind.Automatic) {
            await sleep(25)
            if (newRequestParams.abortSignal?.aborted) {
                return null
            }
        }

        return newRequestParams
    }

    private isStartOfLineRequest(request: RequestParams): boolean {
        return request.docContext.currentLinePrefix.trim() === ''
    }

    dispose() {
        this.startOfLineRequest?.abort()
        this.tailRequest?.abort()
    }
}

class ThrottledRequest {
    public abortController: AbortController
    constructor(public requestParams: RequestParams) {
        this.abortController = requestParams.abortSignal
            ? forkSignal(requestParams.abortSignal)
            : new AbortController()
    }

    public abort() {
        this.abortController.abort()
    }

    public updatedRequestParams(): RequestParams {
        return {
            ...this.requestParams,
            abortSignal: this.abortController.signal,
        }
    }
}
