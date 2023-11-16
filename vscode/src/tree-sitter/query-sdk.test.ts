import { afterEach, describe, expect, it } from 'vitest'

import { SupportedLanguage } from './grammars'
import { resetParsersCache } from './parser'
import { getDocumentQuerySDK } from './query-sdk'
import { initTreeSitterParser } from './test-helpers'

describe('getDocumentQuerySDK', () => {
    afterEach(() => {
        resetParsersCache()
    })

    it.each([
        { languageId: SupportedLanguage.JavaScript },
        { languageId: SupportedLanguage.TypeScript },
        { languageId: SupportedLanguage.JSX },
        { languageId: SupportedLanguage.TSX },
        { languageId: SupportedLanguage.Go },
        { languageId: SupportedLanguage.Python },
    ])('returns valid SDK for $languageId', async ({ languageId }) => {
        const nonInitializedSDK = getDocumentQuerySDK(languageId)
        expect(nonInitializedSDK).toBeNull()

        const parser = await initTreeSitterParser(languageId)
        expect(parser).toBeTruthy()

        const sdk = getDocumentQuerySDK(languageId)
        expect(sdk?.queries.intents).toBeTruthy()
    })

    it.each([
        { languageId: SupportedLanguage.CSharp },
        { languageId: SupportedLanguage.Cpp },
        { languageId: SupportedLanguage.Dart },
        { languageId: SupportedLanguage.Php },
    ])('returns null for $languageId because queries are not defined', async ({ languageId }) => {
        const nonInitializedSDK = getDocumentQuerySDK(languageId)
        expect(nonInitializedSDK).toBeNull()

        const parser = await initTreeSitterParser(languageId)
        expect(parser).toBeTruthy()

        const sdk = getDocumentQuerySDK(languageId)
        expect(sdk).toBeNull()
    })
})
