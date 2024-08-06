import type { PromptString } from '@sourcegraph/cody-shared'
import { SourcegraphNodeCompletionsClient } from '../../../../vscode/src/completions/nodeClient'
import type { CodyBenchOptions } from './command-bench'

export interface LlmJudgeScore {
    score?: string // 'bad' | 'acceptable' | 'amazing'
    scoreNumeric?: number
    reasoning?: string
}

export class LlmJudge {
    client: SourcegraphNodeCompletionsClient
    constructor(options: Pick<CodyBenchOptions, 'srcAccessToken' | 'srcEndpoint'>) {
        this.client = new SourcegraphNodeCompletionsClient({
            serverEndpoint: options.srcEndpoint,
            accessToken: options.srcAccessToken,
            customHeaders: {},
        })
    }

    public async judge(prompt: PromptString): Promise<LlmJudgeScore> {
        const stream = this.client.stream(
            {
                messages: [
                    {
                        speaker: 'human',
                        text: prompt,
                    },
                    { speaker: 'assistant' },
                ],
                maxTokensToSample: 400,
                temperature: 0,
                topK: 1,
                fast: true,
                model: 'anthropic/claude-3-5-sonnet-20240620',
            },
            { apiVersion: 0 }
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
        const reasoning = text.match(/<reasoning>([\s\S]*?)<\/reasoning>/)?.[1]
        const score = text
            .match(/<score>([\s\S]*?)<\/score>/)?.[1]
            ?.trim()
            ?.toLowerCase()
        return {
            score,
            scoreNumeric: scoreNumeric(score),
            reasoning,
        }
    }
}

function scoreNumeric(score?: string): number | undefined {
    switch (score) {
        case 'bad':
        case 'negative':
            return 0
        case 'acceptable':
        case 'positive':
            return 1
        case 'amazing':
            return 2
        default:
            return undefined
    }
}
