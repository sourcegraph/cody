import { toMatchImageSnapshot } from 'jest-image-snapshot'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearCachedImage,
    clearImageCache,
    generateSuggestionAsImage,
    initImageSuggestionService,
} from '..'
import { document } from '../../../../completions/test-helpers'
import { mockLocalStorage } from '../../../../services/LocalStorageProvider'
import type { AutoeditRequestID } from '../../../analytics-logger'
import type { DecorationInfo } from '../../decorators/base'
import { makeVisualDiff } from '../visual-diff'
import type { DiffMode } from '../visual-diff/types'
import { MIXED_ADDITIONS_AND_DELETIONS, MOCK_DIFFS } from './mock-diff'

expect.extend({ toMatchImageSnapshot })

async function generateImageForTest(
    decorations: DecorationInfo,
    lang: string,
    mode: DiffMode
): Promise<{ darkBuffer: Buffer; lightBuffer: Buffer }> {
    mockLocalStorage()
    await initImageSuggestionService()

    const doc = document('')
    const { diff } = makeVisualDiff(decorations, mode, doc)
    const { light, dark } = generateSuggestionAsImage({
        diff,
        lang,
        mode,
        // The default render config changes depending on the platform, so we need to set it manually for tests.
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
    describe.each(MOCK_DIFFS)('$name diff', ({ name, diff, lang }) => {
        it('addition diff visual output', async () => {
            const { darkBuffer, lightBuffer } = await generateImageForTest(diff, lang, 'additions')
            expect(lightBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: `${name}-highlighted-additions-suggestion-light`,
            })
            expect(darkBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: `${name}-highlighted-additions-suggestion-dark`,
            })
        })

        it('unified diff visual output', async () => {
            const { darkBuffer, lightBuffer } = await generateImageForTest(diff, lang, 'unified')
            expect(lightBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: `${name}-highlighted-unified-suggestion-light`,
            })
            expect(darkBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: `${name}-highlighted-unified-suggestion-dark`,
            })
        })
    })

    describe('no syntax highlighting', () => {
        // We want to avoid duplicating the tests (and images) for cases with no highlighting, as it is a small
        // change that isn't required to be tested for a bunch of different diffs.
        // Use a single diff for this case.
        const exampleDiff = MIXED_ADDITIONS_AND_DELETIONS.diff

        it('addition diff visual output', async () => {
            const { darkBuffer, lightBuffer } = await generateImageForTest(
                exampleDiff,
                'non-existent-language',
                'additions'
            )
            expect(lightBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'no-highlighting-additions-suggestion-light',
            })
            expect(darkBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'no-highlighting-additions-suggestion-dark',
            })
        })

        it('unified diff visual output', async () => {
            const { darkBuffer, lightBuffer } = await generateImageForTest(
                exampleDiff,
                'non-existent-language',
                'unified'
            )
            expect(lightBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'no-highlighting-unified-suggestion-light',
            })
            expect(darkBuffer).toMatchImageSnapshot({
                customSnapshotIdentifier: 'no-highlighting-unified-suggestion-dark',
            })
        })
    })

    describe('image caching', () => {
        beforeEach(() => {
            // Clear cache before each test
            clearImageCache()
        })

        it('caches images by requestId', async () => {
            // Setup test conditions
            mockLocalStorage()
            await initImageSuggestionService()

            // Create a mock requestId
            const mockRequestId = 'test-request-id' as AutoeditRequestID

            // Create sample diff
            const doc = document('')
            const exampleDiff = MIXED_ADDITIONS_AND_DELETIONS.diff
            const { diff } = makeVisualDiff(exampleDiff, 'unified', doc)

            // Initial generation - should calculate and cache the image
            const firstResult = generateSuggestionAsImage({
                diff,
                lang: 'typescript',
                mode: 'unified',
                requestId: mockRequestId,
                config: {
                    fontSize: 12,
                    lineHeight: 18,
                    backgroundColor: {
                        dark: '#212121',
                        light: '#f0f0f0',
                    },
                },
            })

            // Second generation with same requestId - should use cached version
            const secondResult = generateSuggestionAsImage({
                diff,
                lang: 'typescript',
                mode: 'unified',
                requestId: mockRequestId,
                config: {
                    // Change config to verify cache is used (these changes should be ignored)
                    fontSize: 14,
                    lineHeight: 20,
                    backgroundColor: {
                        dark: '#000000',
                        light: '#ffffff',
                    },
                },
            })

            // Images should be identical since the cache was used
            expect(secondResult.dark).toBe(firstResult.dark)
            expect(secondResult.light).toBe(firstResult.light)
            expect(secondResult.pixelRatio).toBe(firstResult.pixelRatio)

            // Verify with different requestId generates new image
            const thirdResult = generateSuggestionAsImage({
                diff,
                lang: 'typescript',
                mode: 'unified',
                requestId: 'different-id' as AutoeditRequestID,
                config: {
                    // Same config as second call
                    fontSize: 14,
                    lineHeight: 20,
                    backgroundColor: {
                        dark: '#000000',
                        light: '#ffffff',
                    },
                },
            })

            // Different requestId should generate different image
            expect(thirdResult.dark).not.toBe(firstResult.dark)
        })

        it('clears specific images from cache', async () => {
            // Setup
            mockLocalStorage()
            await initImageSuggestionService()

            const mockRequestId = 'to-be-cleared' as AutoeditRequestID
            const doc = document('')
            const exampleDiff = MIXED_ADDITIONS_AND_DELETIONS.diff
            const { diff } = makeVisualDiff(exampleDiff, 'unified', doc)

            // Spy on the makeDecoratedDiff function to verify cache usage
            const makeDecoratedDiffSpy = vi.spyOn(require('../decorated-diff'), 'makeDecoratedDiff')

            // Generate and cache image
            const firstResult = generateSuggestionAsImage({
                diff,
                lang: 'typescript',
                mode: 'unified',
                requestId: mockRequestId,
                config: {
                    fontSize: 12,
                    lineHeight: 18,
                    backgroundColor: { dark: '#212121', light: '#f0f0f0' },
                },
            })

            expect(makeDecoratedDiffSpy).toHaveBeenCalledTimes(1)
            makeDecoratedDiffSpy.mockClear()

            // Generate again with same requestId - should use cache
            generateSuggestionAsImage({
                diff,
                lang: 'typescript',
                mode: 'unified',
                requestId: mockRequestId,
                config: {
                    fontSize: 12,
                    lineHeight: 18,
                    backgroundColor: { dark: '#212121', light: '#f0f0f0' },
                },
            })

            // Should not call makeDecoratedDiff again (using cache)
            expect(makeDecoratedDiffSpy).not.toHaveBeenCalled()
            makeDecoratedDiffSpy.mockClear()

            // Clear the cache for this requestId
            clearCachedImage(mockRequestId)

            // Generate again - should create new image
            generateSuggestionAsImage({
                diff,
                lang: 'typescript',
                mode: 'unified',
                requestId: mockRequestId,
                config: {
                    fontSize: 12,
                    lineHeight: 18,
                    backgroundColor: { dark: '#212121', light: '#f0f0f0' },
                },
            })

            // Should call makeDecoratedDiff again after cache is cleared
            expect(makeDecoratedDiffSpy).toHaveBeenCalledTimes(1)

            // Clean up
            makeDecoratedDiffSpy.mockRestore()
        })
    })
})
