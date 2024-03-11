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
        { languageId: SupportedLanguage.javascript },
        { languageId: SupportedLanguage.typescript },
        { languageId: SupportedLanguage.javascriptreact },
        { languageId: SupportedLanguage.typescriptreact },
        { languageId: SupportedLanguage.go },
        { languageId: SupportedLanguage.python },
    ])('returns valid SDK for $languageId', async ({ languageId }) => {
        const nonInitializedSDK = getDocumentQuerySDK(languageId)
        expect(nonInitializedSDK).toBeNull()

        const parser = await initTreeSitterParser(languageId)
        expect(parser).toBeTruthy()

        const sdk = getDocumentQuerySDK(languageId)
        expect(sdk?.queries.intents).toBeTruthy()
    })

    it.each([
        { languageId: SupportedLanguage.csharp },
        { languageId: SupportedLanguage.cpp },
        { languageId: SupportedLanguage.csharp },
        { languageId: SupportedLanguage.php },
    ])('returns null for $languageId because queries are not defined', async ({ languageId }) => {
        const nonInitializedSDK = getDocumentQuerySDK(languageId)
        expect(nonInitializedSDK).toBeNull()

        const parser = await initTreeSitterParser(languageId)
        expect(parser).toBeTruthy()

        const sdk = getDocumentQuerySDK(languageId)
        expect(sdk).toBeNull()
    })
})
