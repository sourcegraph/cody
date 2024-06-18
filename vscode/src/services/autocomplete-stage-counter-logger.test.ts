import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { AutocompleteStageCounter, LOG_INTERVAL } from './autocomplete-stage-counter-logger'

describe('AutocompleteStageCounter', () => {
    let recordSpy: MockInstance
    let logger: AutocompleteStageCounter

    beforeEach(() => {
        vi.useFakeTimers()
        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')
        logger = new AutocompleteStageCounter()
    })

    afterEach(() => {
        logger.dispose()
        vi.clearAllTimers()
    })

    it('returns initial state after LOG_INTERVAL', () => {
        vi.advanceTimersByTime(LOG_INTERVAL - 1)

        expect(recordSpy).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: {
                preLastCandidate: 0,
                preCache: 0,
                preDebounce: 0,
                preContextRetrieval: 0,
                preNetworkRequest: 0,
                preFinalCancellationCheck: 0,
                preVisibilityCheck: 0,
            },
        })
    })

    it('records state changes', () => {
        logger.record('preLastCandidate')
        logger.record('preCache')
        logger.record('preDebounce')
        logger.record('preContextRetrieval')
        logger.record('preNetworkRequest')
        logger.record('preFinalCancellationCheck')
        logger.record('preVisibilityCheck')

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: {
                preLastCandidate: 1,
                preCache: 1,
                preDebounce: 1,
                preContextRetrieval: 1,
                preNetworkRequest: 1,
                preFinalCancellationCheck: 1,
                preVisibilityCheck: 1,
            },
        })
    })

    it('resets state after flushing', () => {
        logger.record('preLastCandidate')
        logger.record('preCache')
        logger.record('preCache')

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: {
                preLastCandidate: 1,
                preCache: 2,
                preDebounce: 0,
                preContextRetrieval: 0,
                preNetworkRequest: 0,
                preFinalCancellationCheck: 0,
                preVisibilityCheck: 0,
            },
        })

        logger.record('preDebounce')

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: {
                preLastCandidate: 0,
                preCache: 0,
                preDebounce: 1,
                preContextRetrieval: 0,
                preNetworkRequest: 0,
                preFinalCancellationCheck: 0,
                preVisibilityCheck: 0,
            },
        })
    })
})
