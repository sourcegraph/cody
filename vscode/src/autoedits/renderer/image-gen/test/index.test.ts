import { toMatchImageSnapshot } from 'jest-image-snapshot'
import { describe, expect, it } from 'vitest'
import { generateSuggestionAsImage, initImageSuggestionService } from '..'
import { document } from '../../../../completions/test-helpers'
import { mockLocalStorage } from '../../../../services/LocalStorageProvider'
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
})
