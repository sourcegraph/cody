import { toMatchImageSnapshot } from 'jest-image-snapshot'
import { describe, expect, it } from 'vitest'
import { generateSuggestionAsImage, initImageSuggestionService } from '.'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'

const MOCK_DECORATIONS = [
    {
        ranges: [[4, 55]],
        afterLine: 63,
        lineText: 'for (const remote of repository.state?.remotes || []) {',
    },
    {
        ranges: [[0, 26]],
        afterLine: 64,
        lineText: '    if (remote.fetchUrl) {                             ',
    },
    {
        ranges: [[0, 43]],
        afterLine: 65,
        lineText: '        seenRemoteUrls.add(remote.fetchUrl)            ',
    },
    {
        ranges: [[0, 5]],
        afterLine: 66,
        lineText: '    }                                                  ',
    },
    {
        ranges: [[0, 1]],
        afterLine: 67,
        lineText: '}                                                      ',
    },
] as AddedLinesDecorationInfo[]

expect.extend({ toMatchImageSnapshot })

describe('generateSuggestionAsImage', () => {
    it('generates correct images, with correct highlighting applied, from a set of tokens', async () => {
        await initImageSuggestionService()

        // These are dataURLs created via .toDataURL('image/png') in CanvasKit.
        // I need to convert these to images and somehow diff the images with Vitest.
        // Any ideas would be helpful
        const { light, dark } = generateSuggestionAsImage({
            decorations: MOCK_DECORATIONS,
            lang: 'typescript',
        })

        // These suggestions are generated as dataURLs, so let's convert them back to a useful Buffer for testing
        const lightBuffer = Buffer.from(light.split(',')[1], 'base64')
        const darkBuffer = Buffer.from(dark.split(',')[1], 'base64')

        expect(lightBuffer).toMatchImageSnapshot({
            customSnapshotIdentifier: 'generated-suggestion-light',
        })
        expect(darkBuffer).toMatchImageSnapshot({
            customSnapshotIdentifier: 'generated-suggestion-dark',
        })
    })
})
