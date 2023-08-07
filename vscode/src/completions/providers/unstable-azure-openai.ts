import { logger } from '../../log'
import { ReferenceSnippet } from '../context'
import { getHeadAndTail } from '../text-processing'
import { Completion } from '../types'

import { Provider, ProviderConfig, ProviderOptions } from './provider'

interface UnstableAzureOpenAIOptions {
    serverEndpoint: string
    accessToken: string
}

const OPENING_CODE_TAG = '```'
const CLOSING_CODE_TAG = '```'

interface AzureOpenAIApiResponse {
    id: string
    object: 'text_completion'
    created: number
    model: string
    choices: {
        text: string
        index: number
        finish_reason: 'stop'
        logprobs: null
    }[]
    usage: {
        completion_tokens: number
        prompt_tokens: number
        total_tokens: number
    }
}

const PROVIDER_IDENTIFIER = 'azure-openai'

export class UnstableAzureOpenAIProvider extends Provider {
    private serverEndpoint: string
    private accessToken: string

    constructor(options: ProviderOptions, unstableAzureOpenAIOptions: UnstableAzureOpenAIOptions) {
        super(options)
        this.serverEndpoint = unstableAzureOpenAIOptions.serverEndpoint
        this.accessToken = unstableAzureOpenAIOptions.accessToken
    }

    public async generateCompletions(abortSignal: AbortSignal, snippets: ReferenceSnippet[]): Promise<Completion[]> {
        const { head, tail } = getHeadAndTail(this.options.prefix)

        // Create prompt
        // Although we are using gpt-35-turbo in text completion
        // mode, and not in chat completion mode, it turns out that the model
        // still seems to work well in a conversational style.
        const introSection = 'Human: You are a senior engineer assistant working on a codebase.\n\n'
        const referenceSnippetsSection = snippets
            .map(s => `File: ${s.fileName}\n${OPENING_CODE_TAG}\n${s.content}\n${CLOSING_CODE_TAG}\n\n`)
            .join('')
        const finalSection = `Complete the following code:\n\n${head.trimmed}\n\nAssistant:\n${tail.trimmed}`
        const prompt = introSection + referenceSnippetsSection + finalSection

        const stopSequences = ['Human:', 'Assistant:']
        if (!this.options.multiline) {
            stopSequences.push('\n')
        }

        // Issue request
        const request = {
            prompt,
            temperature: 1,
            top_p: 0.5,
            frequency_penalty: 0,
            presence_penalty: 0,
            max_tokens: this.options.multiline ? 256 : 50,
            stop: stopSequences,
        }

        const log = logger.startCompletion({
            request,
            provider: PROVIDER_IDENTIFIER,
            serverEndpoint: this.serverEndpoint,
        })

        const response = await fetch(this.serverEndpoint, {
            method: 'POST',
            body: JSON.stringify(request),
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.accessToken,
            },
            signal: abortSignal,
        })

        const json = (await response.json()) as AzureOpenAIApiResponse

        // Post-process
        const results = json.choices
            .map(choice => ({
                messages: prompt,
                prefix: this.options.prefix,
                content: postProcess(choice.text),
            }))
            // Omit any empty completion
            .filter(result => result.content.trim() !== '')

        log?.onComplete(results.map(r => r.content))

        return results
    }
}

function postProcess(content: string): string {
    return content.trimEnd()
}

export function createProviderConfig(unstableAzureOpenAIOptions: UnstableAzureOpenAIOptions): ProviderConfig {
    const contextWindowChars = 8_000 // ~ 2k token limit
    return {
        create(options: ProviderOptions) {
            return new UnstableAzureOpenAIProvider(options, unstableAzureOpenAIOptions)
        },
        maximumContextCharacters: contextWindowChars,
        enableExtendedMultilineTriggers: false,
        identifier: PROVIDER_IDENTIFIER,
        supportsInfilling: false,
    }
}
