import { XMLParser } from 'fast-xml-parser'

import {
    type PromptString,
    type SourcegraphCompletionsClient,
    getSimplePreamble,
    ps,
} from '@sourcegraph/cody-shared'
import { outputChannelLogger } from '../output-channel-logger'

import { francAll } from 'franc-min'

const containsMultipleSentences = /[.!?][\s\r\n]+\w/

/**
 * Rewrite the query, using the fast completions model to pull out keywords.
 *
 * For some context backends, rewriting the query can make performance worse.
 */
export async function rewriteKeywordQuery(
    completionsClient: SourcegraphCompletionsClient,
    query: PromptString,
    signal?: AbortSignal
): Promise<string> {
    // In evals, we saw that rewriting tends to make performance worse for simple queries. So we only rewrite
    // in cases where it clearly helps: when it's likely in a non-English language, or there are multiple
    // sentences (so we really need to distill the question).
    const queryString = query.toString()
    if (!containsMultipleSentences.test(queryString)) {
        const english = francAll(queryString).find(v => v[0] === 'eng')
        if (english && english[1] > 0.9) {
            return queryString
        }
    }

    // TODO: move this out to chat controller so we can show a notice.
    try {
        const rewritten = await extractKeywords(completionsClient, query, signal)
        return rewritten.length !== 0 ? rewritten.sort().join(' ') : query.toString()
    } catch (err) {
        outputChannelLogger.logDebug('rewrite-keyword-query', 'failed', { verbose: err })
        // If we fail to rewrite, just return the original query.
        return query.toString()
    }
}

export async function extractKeywords(
    completionsClient: SourcegraphCompletionsClient,
    query: PromptString,
    signal?: AbortSignal
): Promise<string[]> {
    const preamble = getSimplePreamble(undefined, 0, 'Default')
    const stream = completionsClient.stream(
        {
            messages: [
                ...preamble,
                {
                    speaker: 'human',
                    text: ps`You are helping the user search over a codebase. List terms that could be found literally in code snippets or file names relevant to answering the user's query. Present your results in a *single* XML list in the following format: <keywords><keyword><value>a single keyword</value><literal>true if the keyword appears literally in the user query, false otherwise</literal><variants>a space separated list of synonyms and variants of the keyword, including acronyms, abbreviations, and expansions</variants><weight>a numerical weight between 0.0 and 1.0 that indicates the importance of the keyword</weight></keyword></keywords>. Here is the user query: <userQuery>${query}</userQuery>`,
                },
                { speaker: 'assistant' },
            ],
            maxTokensToSample: 400,
            temperature: 0,
            topK: 1,
            fast: true,
        },
        { apiVersion: 0 }, // Use legacy API version for now
        signal
    )

    const streamingText: string[] = []
    for await (const message of stream) {
        signal?.throwIfAborted()
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

    let keywords: { value?: string; variants?: string; weight?: number; literal?: string }[] = []
    switch (true) {
        case Array.isArray(document?.keywords?.keyword): {
            keywords = document.keywords.keyword
            break
        }
        case document?.keywords?.keyword instanceof Object: {
            keywords = [document.keywords.keyword]
            break
        }
    }
    const result = new Set<string>()
    for (const { value, literal } of keywords) {
        outputChannelLogger.logDebug('found keyword', JSON.stringify({ value, literal }))
        if (value && literal) {
            for (const v of value.split(' ')) {
                result.add(v)
            }
        }
    }
    outputChannelLogger.logDebug('keyword extraction', JSON.stringify([...result]))

    return [...result]
}
