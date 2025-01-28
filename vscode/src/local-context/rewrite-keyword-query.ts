import { XMLParser } from 'fast-xml-parser'

import {
    type PromptString,
    type SourcegraphCompletionsClient,
    getSimplePreamble,
    ps,
} from '@sourcegraph/cody-shared'
import { outputChannelLogger } from '../output-channel-logger'

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
    try {
        const rewritten = await extractKeywords(completionsClient, query, signal!)
        console.log({ rewritten })
        return rewritten.length !== 0 ? rewritten.sort().join(' ') : query.toString()
    } catch (err) {
        console.log({ err })
        outputChannelLogger.logDebug('rewrite-keyword-query', 'failed', { verbose: err })
        // If we fail to rewrite, just return the original query.
        return query.toString()
    }
}

/**
 * Extracts keywords from a user query by using the completions model to identify relevant search terms.
 * The function processes the query and returns an array of individual keywords that could be found
 * literally in code snippets or file names.
 */
export async function extractKeywords(
    completionsClient: SourcegraphCompletionsClient,
    query: PromptString,
    signal: AbortSignal
): Promise<string[]> {
    const preamble = getSimplePreamble(undefined, 0, 'Default')
    const stream = completionsClient.stream(
        {
            messages: [
                ...preamble,
                {
                    speaker: 'human',
                    text: ps`You are helping the user search over a codebase. List terms that could be found literally in code snippets or file names relevant to answering the user's query. Limit your results to literal terms that are in the user's query. Present your results in a *single* XML list in the following format: <keywords><keyword>a single keyword</keyword></keywords>. Here is the user query: <userQuery>${query}</userQuery>`,
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

    let lastMessageText = '<keywords></keywords>'
    for await (const message of stream) {
        switch (message.type) {
            case 'change': {
                lastMessageText = message.text
                break
            }
            case 'error': {
                throw message.error
            }
        }
    }

    // If there are multiple keyword entries, it will be parsed as an array. Otherwise, it will be parsed as a string.
    const document: { keywords: { keyword: string | string[] } } = new XMLParser().parse(lastMessageText)

    let keywords: string[] = []
    if (Array.isArray(document.keywords.keyword)) {
        keywords = document.keywords.keyword
    } else {
        keywords = [document.keywords.keyword]
    }

    return keywords.flatMap(keyword => keyword.split(' ').filter(v => v !== ''))
}
