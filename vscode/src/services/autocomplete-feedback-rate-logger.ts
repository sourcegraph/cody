import type * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'

export const LOG_INTERVAL = 30 * 60 * 1000 // 30 minutes

/**
 * Keys represent autocomplete pipeline stages in chronological order.
 */
const INITIAL_STATE = {
    preLastCandidate: 0,
    preCache: 0,
    preDebounce: 0,
    preContextRetrieval: 0,
    preNetworkRequest: 0,
    preFinalCancellationCheck: 0,
    preVisibilityCheck: 0,
}

export class AutocompleteFeedbackRateLogger implements vscode.Disposable {
    private nextTimeoutId: NodeJS.Timeout | null = null
    private currentState = { ...INITIAL_STATE }

    constructor() {
        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    public flush(): void {
        this.nextTimeoutId = null
        const stateToLog = this.currentState
        this.currentState = { ...INITIAL_STATE }

        telemetryRecorder.recordEvent('cody.completion.feedbackRate', 'flush', {
            metadata: stateToLog,
        })

        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    /**
     * Records the occurrence of a specific stage in the autocompletion generation pipeline.
     */
    public record(state: keyof typeof this.currentState): void {
        this.currentState[state]++
    }

    public dispose(): void {
        this.flush()
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
    }
}

/**
 * Feedback rate captures what fraction of opportunities to generate a suggestion reaches
 * different stages of the autocomplete generation pipeline.
 */
export const autocompleteFeedbackRateLogger = new AutocompleteFeedbackRateLogger()
