import { describe, expect, it } from 'vitest'
import { getArtificialDelay, lowPerformanceConfig } from './artificial-delay'

describe('getArtificialDelay', () => {
    const testCases = [
        { languageId: 'css', completionIntent: undefined, isLowPerf: true },
        { languageId: 'css', completionIntent: 'comment', isLowPerf: true },
        { languageId: 'go', completionIntent: 'comment', isLowPerf: true },
        { languageId: 'go', completionIntent: undefined, isLowPerf: false },
    ]

    it('correctly identifies low performance configurations', () => {
        for (const { languageId, completionIntent, isLowPerf } of testCases) {
            const isLowPerfLang = lowPerformanceConfig.languageIds.has(languageId)
            const isLowPerfIntent = completionIntent
                ? lowPerformanceConfig.completionIntents.has(completionIntent as string)
                : false
            expect(isLowPerfLang || isLowPerfIntent).toBe(isLowPerf)
        }
    })

    it.each(testCases)(
        'returns correct delay based on configuration when codyAutocompleteDisableLowPerfLangDelay is false',
        ({ languageId, completionIntent, isLowPerf }) => {
            const params = {
                languageId,
                completionIntent: completionIntent as 'comment' | undefined,
                codyAutocompleteDisableLowPerfLangDelay: false,
            }
            expect(getArtificialDelay(params)).toBe(isLowPerf ? 1000 : 0)
        }
    )

    it.each(testCases)(
        'returns no delay when codyAutocompleteDisableLowPerfLangDelay is true',
        ({ languageId, completionIntent }) => {
            const params = {
                languageId,
                completionIntent: completionIntent as 'comment' | undefined,
                codyAutocompleteDisableLowPerfLangDelay: true,
            }
            expect(getArtificialDelay(params)).toBe(0)
        }
    )
})
