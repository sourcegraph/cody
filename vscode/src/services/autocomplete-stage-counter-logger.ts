import type * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'

export const LOG_INTERVAL = 30 * 60 * 1000 // 30 minutes

/**
 * Keys represent autocomplete pipeline stages in chronological order.
 */
export const AUTOCOMPLETE_STAGE_COUNTER_INITIAL_STATE = {
    preLastCandidate: 0,
    preCache: 0,
    preSmartThrottle: 0,
    preDebounce: 0,
    preContextRetrieval: 0,
    preNetworkRequest: 0,
    preFinalCancellationCheck: 0,
    preVisibilityCheck: 0,
}

export type AutocompletePipelineCountedStage = keyof typeof AUTOCOMPLETE_STAGE_COUNTER_INITIAL_STATE

export class AutocompleteStageCounter implements vscode.Disposable {
    private nextTimeoutId: NodeJS.Timeout | null = null
    private providerModel: string | null = null
    private currentState = { ...AUTOCOMPLETE_STAGE_COUNTER_INITIAL_STATE }

    constructor() {
        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    public setProviderModel(providerModel: string): void {
        // Flush the current counter on model change.
        if (this.providerModel !== null && this.providerModel !== providerModel) {
            this.flush()
        }

        this.providerModel = providerModel
    }

    //
    //
    public flush(): void {
        this.nextTimeoutId = null
        const stateToLog = this.currentState
        this.currentState = { ...AUTOCOMPLETE_STAGE_COUNTER_INITIAL_STATE }

        // Do not log empty counter events.
        if (Object.values(stateToLog).some(count => count > 0)) {
            // adding something like for events
            // Add a counting of events and send those via looker for the events
            // Flush a set of events for trim lrejection
            telemetryRecorder.recordEvent('cody.completion.stageCounter', 'flush', {
                metadata: stateToLog,
                privateMetadata: { providerModel: this.providerModel },
            })
        }

        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    /**
     * Records the occurrence of a specific stage in the autocompletion generation pipeline.
     */
    public record(state: AutocompletePipelineCountedStage): void {
        if (!this.providerModel) {
            // Do nothing if provider model is not set.
            return
        }

        this.currentState[state]++
    }
    //
    // Like the code above, you can reuse the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:

    public dispose(): void {
        this.flush()
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
    }
}

/**
 * Counts the completion requests that reached different stages of the autocomplete generation pipeline.
 *
 * Used in the analytics pipeline to calculate the "feedback rate," which captures what
 * fraction of opportunities to generate a suggestion reaches different pipeline stages.
 */
export const autocompleteStageCounterLogger = new AutocompleteStageCounter()
