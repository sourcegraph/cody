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

    it('does not log empty counter events', () => {
        logger.setProviderModel('test-model')
        vi.advanceTimersByTime(LOG_INTERVAL - 1)

        expect(recordSpy).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)

        expect(recordSpy).not.toHaveBeenCalled()
    })

    it('records state changes', () => {
        logger.setProviderModel('test-model')
        logger.record('preLastCandidate')
        logger.record('preCache')
        logger.record('preSmartThrottle')
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
                preSmartThrottle: 1,
                preDebounce: 1,
                preContextRetrieval: 1,
                preNetworkRequest: 1,
                preFinalCancellationCheck: 1,
                preVisibilityCheck: 1,
            },
            privateMetadata: { providerModel: 'test-model' },
        })
    })

    it('resets state after flushing', () => {
        logger.setProviderModel('test-model')
        logger.record('preLastCandidate')
        logger.record('preCache')
        logger.record('preCache')

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: {
                preLastCandidate: 1,
                preCache: 2,
                preSmartThrottle: 0,
                preDebounce: 0,
                preContextRetrieval: 0,
                preNetworkRequest: 0,
                preFinalCancellationCheck: 0,
                preVisibilityCheck: 0,
            },
            privateMetadata: { providerModel: 'test-model' },
        })

        logger.record('preDebounce')

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: {
                preLastCandidate: 0,
                preCache: 0,
                preSmartThrottle: 0,
                preDebounce: 1,
                preContextRetrieval: 0,
                preNetworkRequest: 0,
                preFinalCancellationCheck: 0,
                preVisibilityCheck: 0,
            },
            privateMetadata: { providerModel: 'test-model' },
        })
    })

    it('includes providerModel in privateMetadata when set', () => {
        logger.setProviderModel('test-model')
        logger.record('preLastCandidate')

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: expect.any(Object),
            privateMetadata: { providerModel: 'test-model' },
        })
    })

    it('flushes when providerModel changes', () => {
        logger.setProviderModel('model-1')
        logger.record('preLastCandidate')

        logger.setProviderModel('model-2')

        expect(recordSpy).toHaveBeenCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: {
                preLastCandidate: 1,
                preCache: 0,
                preDebounce: 0,
                preContextRetrieval: 0,
                preNetworkRequest: 0,
                preSmartThrottle: 0,
                preFinalCancellationCheck: 0,
                preVisibilityCheck: 0,
            },
            privateMetadata: { providerModel: 'model-1' },
        })
    })

    it('does not flush when setting the same providerModel', () => {
        logger.setProviderModel('test-model')
        logger.record('preLastCandidate')

        logger.setProviderModel('test-model')

        expect(recordSpy).not.toHaveBeenCalled()
    })

    it('includes latest providerModel in flush after changes', () => {
        logger.setProviderModel('model-1')
        logger.record('preLastCandidate')

        logger.setProviderModel('model-2')
        logger.record('preCache')

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledTimes(2)
        expect(recordSpy).toHaveBeenLastCalledWith('cody.completion.stageCounter', 'flush', {
            metadata: {
                preLastCandidate: 0,
                preCache: 1,
                preDebounce: 0,
                preContextRetrieval: 0,
                preSmartThrottle: 0,
                preNetworkRequest: 0,
                preFinalCancellationCheck: 0,
                preVisibilityCheck: 0,
            },
            privateMetadata: { providerModel: 'model-2' },
        })
    })
})
