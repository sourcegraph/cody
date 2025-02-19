import { toMatchImageSnapshot } from 'jest-image-snapshot'
import { describe, expect, it } from 'vitest'
import { type DiffMode, generateSuggestionAsImage, initImageSuggestionService } from '..'
import { document } from '../../../../completions/test-helpers'
import { mockLocalStorage } from '../../../../services/LocalStorageProvider'
import type { DecorationInfo } from '../../decorators/base'
import { MOCK_DIFF } from './mock-diff'

expect.extend({ toMatchImageSnapshot })

async function generateImageForTest(
    decorations: DecorationInfo,
    lang: string,
    mode: DiffMode
): Promise<{ darkBuffer: Buffer; lightBuffer: Buffer }> {
    mockLocalStorage()
    await initImageSuggestionService()

    const doc = document('')
    const { light, dark } = generateSuggestionAsImage({
        decorations,
        lang,
        mode,
        document: doc, // The default render config changes depending on the platform, so we need to set it manually for tests.
        // We're using the same defaults as VS Code on MacOS here.
        config: {
            fontSize: 12,
            lineHeight: 18,
            backgroundColor: {
                dark: '#212121',
                light: '#f0f0f0',
            },
        },
    })
    return {
        // These suggestions are generated as dataURLs, so let's convert them back to a useful Buffer for testing
        darkBuffer: Buffer.from(dark.split(',')[1], 'base64'),
        lightBuffer: Buffer.from(light.split(',')[1], 'base64'),
    }
}

describe('generateSuggestionAsImage', () => {
    describe('addition diff', () => {
        it('generates correct images, with correct highlighting applied, from a set of tokens', async () => {
            const { darkBuffer, lightBuffer } = await generateImageForTest(
                MOCK_DIFF,
                'typescript',
                'additions'
            )
            expect(lightBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'highlighted-additions-suggestion-light',
            })
            expect(darkBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'highlighted-additions-suggestion-dark',
            })
        })

        it('generates correct images, with correct highlighting applied, from a set of tokens in a language that does not have supported highlighting', async () => {
            const { darkBuffer, lightBuffer } = await generateImageForTest(
                MOCK_DIFF,
                'non-existent-language',
                'additions'
            )
            expect(lightBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'unhighlighted-additions-suggestion-light',
            })
            expect(darkBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'unhighlighted-additions-suggestion-dark',
            })
        })
    })

    describe('unfied diff', () => {
        it('generates correct images, with correct highlighting applied, from a set of tokens', async () => {
            const { darkBuffer, lightBuffer } = await generateImageForTest(
                MOCK_DIFF,
                'typescript',
                'unified'
            )
            expect(lightBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'highlighted-unified-suggestion-light',
            })
            expect(darkBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'highlighted-unified-suggestion-dark',
            })
        })

        it('generates correct images, with correct highlighting applied, from a set of tokens in a language that does not have supported highlighting', async () => {
            const { darkBuffer, lightBuffer } = await generateImageForTest(
                MOCK_DIFF,
                'non-existent-language',
                'unified'
            )
            expect(lightBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'unhighlighted-unified-suggestion-light',
            })
            expect(darkBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'unhighlighted-unified-suggestion-dark',
            })
        })
    })
})
