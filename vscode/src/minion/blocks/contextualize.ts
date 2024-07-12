import type { Block, BlockResult, Memory } from '../statemachine'

import type Anthropic from '@anthropic-ai/sdk'
import type { CancellationToken } from 'vscode'
import type { Environment, TextSnippet } from '../environment'
import {
    generateQueriesSystem,
    generateQueriesUser,
    isRelevantSnippetSystem,
    isRelevantSnippetUser,
} from '../prompts'
import { extractXMLFromAnthropicResponse } from '../util'

export const ContextualizeBlock: Block = {
    id: 'contextualize',

    do: async (
        cancelToken: CancellationToken,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<BlockResult> => {
        let issueDescriptionMaybe = undefined
        for (const event of memory.getEvents().toReversed()) {
            if (event.type === 'restate') {
                issueDescriptionMaybe = event.output
                break
            }
        }
        if (issueDescriptionMaybe === undefined) {
            throw new Error('could not find Restate in previous events')
        }
        const issueDescription: string = issueDescriptionMaybe

        if (cancelToken.isCancellationRequested) {
            return { status: 'cancelled' }
        }

        // Generate symf search queries
        const system = generateQueriesSystem
        const message = await anthropic.messages.create({
            system,
            max_tokens: 4096,
            messages: generateQueriesUser(issueDescription),
            model: 'claude-3-haiku-20240307',
        })
        const rawQueries = extractXMLFromAnthropicResponse(message, 'searchQueries')
        const queries = rawQueries?.split('\n').map(line => line.split(' ').map(k => k.trim()))

        if (cancelToken.isCancellationRequested) {
            return { status: 'cancelled' }
        }

        // Issue searches through symf
        const allResults = []
        for (const query of queries) {
            if (cancelToken.isCancellationRequested) {
                return { status: 'cancelled' }
            }
            const results = await env.search(query.join(' '))
            allResults.push(...results)
        }

        // LLM reranking
        const allResultsRelevant: [TextSnippet, boolean][] | null = await Promise.race([
            await Promise.all(
                allResults.map(
                    async (result: TextSnippet): Promise<[TextSnippet, boolean]> => [
                        result,
                        await isRelevantSnippet(issueDescription, result, anthropic),
                    ]
                )
            ),
            new Promise<null>(resolve => {
                cancelToken.onCancellationRequested(() => resolve(null))
            }),
        ])
        if (allResultsRelevant === null || cancelToken.isCancellationRequested) {
            return { status: 'cancelled' }
        }
        const relevantResults = allResultsRelevant
            .filter(([_, isRelevant]) => isRelevant)
            .map(([result]) => result)

        // Record relevant snippets as event
        memory.postEvent({
            level: 0,
            type: 'contextualize',
            output: relevantResults.map(result => {
                return {
                    source: {
                        uri: result.uri,
                        range: result.range,
                    },
                    text: result.text,
                    comment: '', // TODO(beyang): annotate each snippet with commentary tying it to the issue description
                }
            }),
        })

        return { status: 'done' }
    },
}

// TODO(beyang): stream so you can cancel
async function isRelevantSnippet(
    taskDescription: string,
    result: TextSnippet,
    anthropic: Anthropic
): Promise<boolean> {
    const message = await anthropic.messages.create({
        system: isRelevantSnippetSystem,
        max_tokens: 4096,
        messages: isRelevantSnippetUser(taskDescription, result.uri.path, result.text),
        model: 'claude-3-haiku-20240307',
    })
    const rawShouldModify = extractXMLFromAnthropicResponse(message, 'shouldModify')
    return rawShouldModify.toLowerCase() === 'true'
}
