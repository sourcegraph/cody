import fetch from 'isomorphic-fetch'

import { logger } from '../../log'
import { ReferenceSnippet } from '../context'
import { getLanguageConfig } from '../language'
import { Completion } from '../types'
import { isAbortError } from '../utils'

import { Provider, ProviderConfig, ProviderOptions } from './provider'

interface UnstableFireworksOptions {
    serverEndpoint: string
    accessToken: null | string
}

const PROVIDER_IDENTIFIER = 'fireworks'
const STOP_WORD = '<|endoftext|>'
const CONTEXT_WINDOW_CHARS = 3500 // ~ 1280 token limit

export class UnstableFireworksProvider extends Provider {
    private serverEndpoint: string
    private accessToken: null | string

    constructor(options: ProviderOptions, unstableFireworksOptions: UnstableFireworksOptions) {
        super(options)
        this.serverEndpoint = unstableFireworksOptions.serverEndpoint
        this.accessToken = unstableFireworksOptions.accessToken
    }

    private createPrompt(snippets: ReferenceSnippet[]): string {
        const maxPromptChars = CONTEXT_WINDOW_CHARS - CONTEXT_WINDOW_CHARS * this.options.responsePercentage

        const intro: string[] = []
        let prompt = ''

        const languageConfig = getLanguageConfig(this.options.languageId)
        if (languageConfig) {
            intro.push(`Path: ${this.options.fileName}`)
        }

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]
                intro.push(`Here is a reference snippet of code from ${snippet.fileName}:\n\n${snippet.content}`)
            }

            const introString =
                intro
                    .join('\n\n')
                    .split('\n')
                    .map(line => (languageConfig ? languageConfig.commentStart + line : ''))
                    .join('\n') + '\n'

            // Prompt format is taken form https://starcoder.co/bigcode/starcoder#fill-in-the-middle
            const nextPrompt = `<fim_prefix>${introString}${this.options.prefix}<fim_suffix>${this.options.suffix}<fim_middle>`

            if (nextPrompt.length >= maxPromptChars) {
                return prompt
            }

            prompt = nextPrompt
        }

        return prompt
    }

    public async generateCompletions(abortSignal: AbortSignal, snippets: ReferenceSnippet[]): Promise<Completion[]> {
        const prompt = this.createPrompt(snippets)

        const request = {
            prompt,
            // To speed up sample generation in single-line case, we request a lower token limit
            // since we can't terminate on the first `\n`.
            max_tokens: this.options.multiline ? 256 : 30,
            temperature: 0.4,
            top_p: 0.95,
            min_tokens: 1,
            n: this.options.n,
            echo: false,
            model: 'accounts/fireworks/models/fireworks-starcoder-16b-w8a16',
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
                Authorization: `Bearer ${this.accessToken}`,
            },
            signal: abortSignal,
        })

        try {
            const data = (await response.json()) as
                | { choices: { text: string; finish_reason: string }[] }
                | { error: { message: string } }

            if ('error' in data) {
                throw new Error(data.error.message)
            }

            const completions = data.choices.map(c => ({
                content: postProcess(c.text, this.options.multiline),
                stopReason: c.finish_reason,
            }))
            log?.onComplete(completions.map(c => c.content))

            return completions.map(c => ({
                prefix: this.options.prefix,
                content: c.content,
                stopReason: c.stopReason,
            }))
        } catch (error: any) {
            if (!isAbortError(error)) {
                log?.onError(error)
            }

            throw error
        }
    }
}

function postProcess(content: string, multiline: boolean): string {
    content = content.replace(STOP_WORD, '')

    // The model might return multiple lines for single line completions because
    // we are only able to specify a token limit.
    if (!multiline && content.includes('\n')) {
        content = content.slice(0, content.indexOf('\n'))
    }

    return content.trim()
}

export function createProviderConfig(unstableFireworksOptions: UnstableFireworksOptions): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new UnstableFireworksProvider(options, unstableFireworksOptions)
        },
        maximumContextCharacters: CONTEXT_WINDOW_CHARS,
        enableExtendedMultilineTriggers: true,
        identifier: PROVIDER_IDENTIFIER,
    }
}
