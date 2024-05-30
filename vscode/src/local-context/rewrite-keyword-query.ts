import { XMLParser } from 'fast-xml-parser'

import {
    type PromptString,
    type SourcegraphCompletionsClient,
    getSimplePreamble,
    ps,
} from '@sourcegraph/cody-shared'

// biome-ignore lint: this regex intentionally contains control characters
const containsNonAscii = /[^\u0000-\u007F]/
const containsMultipleSentences = /[.!?][\s\r\n]+\w/

/**
 * Rewrite the query, using the fast completions model to pull out keywords.
 *
 * For some context backends, rewriting the query can make performance worse. Setting the 'restrictRewrite' param
 * only rewrites in cases where it clearly helps: there are non-ASCII characters (meaning it's very likely in a
 * foreign language), or there are multiple sentences (so we need to distill the question).
 */
export async function rewriteKeywordQuery(
    completionsClient: SourcegraphCompletionsClient,
    query: PromptString,
    options?: {
        restrictRewrite: boolean
    }
): Promise<string> {
    if (options?.restrictRewrite) {
        const queryString = query.toString()
        if (!containsNonAscii.test(queryString) && !containsMultipleSentences.test(queryString)) {
            return queryString
        }
    }

    const preamble = getSimplePreamble(undefined, 0)
    const stream = completionsClient.stream(
        {
            messages: [
                ...preamble,
                {
                    speaker: 'human',
                    text: ps`You are helping the user search over a codebase. List some filename fragments that would match files relevant to read to answer the user's query. Present your results in an XML list in the following format: <keywords><keyword><value>a single keyword</value><variants>a space separated list of synonyms and variants of the keyword, including acronyms, abbreviations, and expansions</variants><weight>a numerical weight between 0.0 and 1.0 that indicates the importance of the keyword</weight></keyword></keywords>. Here is the user query: <userQuery>${query}</userQuery>`,
                },
                { speaker: 'assistant' },
            ],
            maxTokensToSample: 400,
            temperature: 0,
            topK: 1,
            fast: true,
        },
        0 // Use legacy API version for now
    )

    const streamingText: string[] = []
    for await (const message of stream) {
        switch (message.type) {
            case 'change': {
                streamingText.push(message.text)
                break
            }
            case 'error': {
                throw message.error
            }
        }
    }

    const text = streamingText.at(-1) ?? ''
    const parser = new XMLParser()
    const document = parser.parse(text)
    const keywords: { value?: string; variants?: string; weight?: number }[] =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        document?.keywords?.keyword ?? []
    const result = new Set<string>()
    for (const { value, variants } of keywords) {
        if (typeof value === 'string' && value) {
            result.add(value)
        }
        if (typeof variants === 'string') {
            for (const variant of variants.split(' ')) {
                if (variant) {
                    result.add(variant)
                }
            }
        }
    }
    return [...result].sort().join(' ')
}
