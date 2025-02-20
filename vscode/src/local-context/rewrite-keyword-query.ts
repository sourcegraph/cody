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
        const rewritten = await doRewrite(completionsClient, query, signal)
        return rewritten.length !== 0 ? rewritten : query.toString()
    } catch (err) {
        outputChannelLogger.logDebug('rewrite-keyword-query', 'failed', { verbose: err })
        // If we fail to rewrite, just return the original query.
        return query.toString()
    }
}

async function doRewrite(
    completionsClient: SourcegraphCompletionsClient,
    query: PromptString,
    signal?: AbortSignal
): Promise<string> {
    const preamble = getSimplePreamble(undefined, 0, 'Default')
    const stream = completionsClient.stream(
        {
            messages: [
                ...preamble,
                {
                    speaker: 'human',
                    text: ps`You are helping a developer answer questions about their codebase. Write a keyword search to help find the relevant files to answer the question. Examples:
- Find a symbol by name: \`<query>SearchJob</query>\`
- Find a symbol using keywords: \`<query>search indexing queue</query>\`
- Find where something is implemented: \`<query>check for authentication</query>\`
- Find string literal in code: \`<query>"result limit hit"</query>\`

 ONLY return the keyword search. Question: ${query}
`,
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
    const match = text.match(/<query>(.*?)<\/query>/)
    return match?.[1] ?? query.toString()
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
                    text: ps`You are helping the user search over a codebase. List terms that could be found literally in code snippets or file names relevant to answering the user's query. Limit your results to terms that are in the user's query. Present your results in a *single* XML list in the following format: <keywords><keyword>a single keyword</keyword></keywords>. Here is the user query: <userQuery>${query}</userQuery>`,
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
