import { toMatchImageSnapshot } from 'jest-image-snapshot'
import { describe, expect, it } from 'vitest'
import { generateSuggestionAsImage, initImageSuggestionService } from '.'
import type {
    AddedLinesDecorationInfo,
    DiffedTextDecorationRange,
} from '../decorators/default-decorator'

const makeDiffHighlightedRange = (start: number, end: number): DiffedTextDecorationRange => ({
    type: 'diff-added',
    range: [start, end],
})

const MOCK_DECORATIONS = [
    {
        highlightedRanges: [makeDiffHighlightedRange(4, 55)],
        afterLine: 63,
        lineText: 'for (const remote of repository.state?.remotes || []) {',
    },
    {
        highlightedRanges: [makeDiffHighlightedRange(0, 26)],
        afterLine: 64,
        lineText: '    if (remote.fetchUrl) {                             ',
    },
    {
        highlightedRanges: [makeDiffHighlightedRange(0, 43)],
        afterLine: 65,
        lineText: '        seenRemoteUrls.add(remote.fetchUrl)            ',
    },
    {
        highlightedRanges: [makeDiffHighlightedRange(0, 5)],
        afterLine: 66,
        lineText: '    }                                                  ',
    },
    {
        highlightedRanges: [makeDiffHighlightedRange(0, 1)],
        afterLine: 67,
        lineText: '}                                                      ',
    },
] as AddedLinesDecorationInfo[]

expect.extend({ toMatchImageSnapshot })

async function generateImageForTest(
    decorations: AddedLinesDecorationInfo[],
    lang: string
): Promise<{ darkBuffer: Buffer; lightBuffer: Buffer }> {
    await initImageSuggestionService()

    const { light, dark } = generateSuggestionAsImage({
        decorations,
        lang,
        // The default render config changes depending on the platform, so we need to set it manually for tests.
        // We're using the same defaults as VS Code on MacOS here.
        config: {
            fontSize: 12,
            lineHeight: 18,
        },
    })

    return {
        // These suggestions are generated as dataURLs, so let's convert them back to a useful Buffer for testing
        darkBuffer: Buffer.from(dark.split(',')[1], 'base64'),
        lightBuffer: Buffer.from(light.split(',')[1], 'base64'),
    }
}

describe('generateSuggestionAsImage', () => {
    it('generates correct images, with correct highlighting applied, from a set of tokens', async () => {
        const { darkBuffer, lightBuffer } = await generateImageForTest(MOCK_DECORATIONS, 'typescript')
        expect(lightBuffer).toMatchImageSnapshot({
            customSnapshotIdentifier: 'highlighted-suggestion-light',
        })
        expect(darkBuffer).toMatchImageSnapshot({
            customSnapshotIdentifier: 'highlighted-suggestion-dark',
        })
    })

    it('generates correct images, with correct highlighting applied, from a set of tokens in a language that does not have supported highlighting', async () => {
        const { darkBuffer, lightBuffer } = await generateImageForTest(
            MOCK_DECORATIONS,
            'non-existent-language'
        )
        expect(lightBuffer).toMatchImageSnapshot({
            customSnapshotIdentifier: 'unhighlighted-suggestion-light',
        })
        expect(darkBuffer).toMatchImageSnapshot({
            customSnapshotIdentifier: 'unhighlighted-suggestion-dark',
        })
    })
})
