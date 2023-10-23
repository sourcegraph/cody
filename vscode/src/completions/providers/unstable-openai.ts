import * as vscode from 'vscode'

import { tokensToChars } from '@sourcegraph/cody-shared/src/prompt/constants'
import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { canUsePartialCompletion } from '../can-use-partial-completion'
import { CodeCompletionsClient, CodeCompletionsParams } from '../client'
import { CLOSING_CODE_TAG, getHeadAndTail, MULTILINE_STOP_SEQUENCE, OPENING_CODE_TAG } from '../text-processing'
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion'
import { InlineCompletionItemWithAnalytics } from '../text-processing/process-inline-completions'
import { ContextSnippet } from '../types'
import { forkSignal } from '../utils'

import {
    CompletionProviderTracer,
    Provider,
    ProviderConfig,
    ProviderOptions,
    standardContextSizeHints,
} from './provider'

const MULTI_LINE_STOP_SEQUENCES = [CLOSING_CODE_TAG]
const SINGLE_LINE_STOP_SEQUENCES = [CLOSING_CODE_TAG, MULTILINE_STOP_SEQUENCE]

interface UnstableOpenAIOptions {
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
}

const PROVIDER_IDENTIFIER = 'unstable-openai'
const MAX_RESPONSE_TOKENS = 256

export class UnstableOpenAIProvider extends Provider {
    private client: Pick<CodeCompletionsClient, 'complete'>
    private promptChars: number
    private instructions: string = `You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags.  You only respond with code that works and fits seamlessly with surrounding code do not include anything else beyond the code.`

    constructor(options: ProviderOptions, { maxContextTokens, client }: Required<UnstableOpenAIOptions>) {
        super(options)
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.client = client
    }

    public emptyPromptLength(): number {
        const promptNoSnippets = [this.instructions, this.createPromptPrefix()].join('\n\n')
        return promptNoSnippets.length - 10 // extra 10 chars of buffer cuz who knows
    }

    private createPromptPrefix(): string {
        const prefixLines = this.options.docContext.prefix.split('\n')
        if (prefixLines.length === 0) {
            throw new Error('no prefix lines')
        }

        const { head, tail } = getHeadAndTail(this.options.docContext.prefix)

        // Infill block represents the code we want the model to complete
        const infillBlock = tail.trimmed
        // code before the cursor, without the code extracted for the infillBlock
        const infillPrefix = head.raw?.startsWith(tail.trimmed) ? '' : `${head.raw}`
        // code after the cursor
        const infillSuffix = this.options.docContext.suffix
        const relativeFilePath = vscode.workspace.asRelativePath(this.options.document.fileName)

        return `Below is the code from file path ${relativeFilePath}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:\n\`\`\`\n${infillPrefix}${OPENING_CODE_TAG}${infillBlock}${CLOSING_CODE_TAG}${infillSuffix}\n\`\`\`

${OPENING_CODE_TAG}${infillBlock}`
    }

    // Creates the resulting prompt and adds as many snippets from the reference
    // list as possible.
    protected createPrompt(snippets: ContextSnippet[]): string {
        const prefix = this.createPromptPrefix()

        const referenceSnippetMessages: string[] = []

        let remainingChars = this.promptChars - this.emptyPromptLength()

        for (const snippet of snippets) {
            const snippetMessages: string[] = [
                'symbol' in snippet && snippet.symbol !== ''
                    ? `Additional documentation for \`${snippet.symbol}\`: ${OPENING_CODE_TAG}${snippet.content}${CLOSING_CODE_TAG}`
                    : `Codebase context from file path '${snippet.fileName}': ${OPENING_CODE_TAG}${snippet.content}${CLOSING_CODE_TAG}`,
            ]
            const numSnippetChars = snippetMessages.join(`\n\n`).length + 1
            if (numSnippetChars > remainingChars) {
                break
            }
            referenceSnippetMessages.push(...snippetMessages)
            remainingChars -= numSnippetChars
        }

        const messages = [this.instructions, ...referenceSnippetMessages, prefix]
        return messages.join('\n\n')
    }

    public async generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<InlineCompletionItemWithAnalytics[]> {
        const prompt = this.createPrompt(snippets)

        const args: CodeCompletionsParams = {
            messages: [{ speaker: 'human', text: prompt }],
            maxTokensToSample: this.options.multiline ? MAX_RESPONSE_TOKENS : 50,
            temperature: 1,
            topP: 0.5,
            stopSequences: this.options.multiline ? MULTI_LINE_STOP_SEQUENCES : SINGLE_LINE_STOP_SEQUENCES,
            timeoutMs: this.options.multiline ? 15000 : 5000,
        }

        tracer?.params(args)

        const completions = await Promise.all(
            Array.from({ length: this.options.n }).map(() => {
                return this.fetchAndProcessCompletions(this.client, args, abortSignal)
            })
        )

        tracer?.result({ completions })
        return completions
    }

    private async fetchAndProcessCompletions(
        client: Pick<CodeCompletionsClient, 'complete'>,
        params: CodeCompletionsParams,
        abortSignal: AbortSignal
    ): Promise<InlineCompletionItemWithAnalytics> {
        // The Async executor is required to return the completion early if a partial result from SSE can be used.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            try {
                const abortController = forkSignal(abortSignal)

                const result = await client.complete(
                    params,
                    (incompleteResponse: CompletionResponse) => {
                        if (!this.options.disableStreamingTruncation) {
                            const processedCompletion = this.postProcess(incompleteResponse.completion)
                            const completion = canUsePartialCompletion(processedCompletion, this.options)

                            if (completion) {
                                resolve({ ...completion, stopReason: 'streaming-truncation' })
                                abortController.abort()
                            }
                        }
                    },
                    abortController.signal
                )

                const processedCompletion = this.postProcess(result.completion)
                const completion = parseAndTruncateCompletion(processedCompletion, this.options)

                resolve({ ...completion, stopReason: result.stopReason })
            } catch (error) {
                reject(error)
            }
        })
    }

    private postProcess(content: string): string {
        if (content.startsWith('```')) {
            let arr = content.split('\n')
            arr.shift()
            content = arr.join('\n')
        }

        return content.trimEnd()
    }
}

export function createProviderConfig({
    model,
    maxContextTokens = 2048,
    ...otherOptions
}: UnstableOpenAIOptions & { model?: string }): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new UnstableOpenAIProvider(options, { maxContextTokens, ...otherOptions })
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        enableExtendedMultilineTriggers: false,
        identifier: PROVIDER_IDENTIFIER,
        model: model ?? 'gpt-35-turbo',
    }
}
