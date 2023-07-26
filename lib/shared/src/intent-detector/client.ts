import { ANSWER_TOKENS } from '../prompt/constants'
import { Message } from '../sourcegraph-api'
import { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

import { IntentClassificationOption, IntentDetector } from '.'

const editorRegexps = [/editor/, /(open|current|this)\s+file/, /current(ly)?\s+open/, /have\s+open/]

export class SourcegraphIntentDetectorClient implements IntentDetector {
    constructor(
        private client: SourcegraphGraphQLAPIClient,
        private completionsClient: SourcegraphCompletionsClient
    ) {}

    public isCodebaseContextRequired(input: string): Promise<boolean | Error> {
        return this.client.isContextRequiredForQuery(input)
    }

    public isEditorContextRequired(input: string): boolean | Error {
        const inputLowerCase = input.toLowerCase()
        // If the input matches any of the `editorRegexps` we assume that we have to include
        // the editor context (e.g., currently open file) to the overall message context.
        for (const regexp of editorRegexps) {
            if (inputLowerCase.match(regexp)) {
                return true
            }
        }
        return false
    }

    private buildInitialPrompt(options: IntentClassificationOption[]): string {
        const functions = options
            .map(
                ({ id, description }) => `
Function Id: ${id}
Function Description: ${description}
`
            )
            .join('\n')

        return prompt.replace('{functions}', functions)
    }

    private buildExampleTranscript(options: IntentClassificationOption[]): Message[] {
        const messages = options.flatMap(({ id, examplePrompts }) =>
            examplePrompts.flatMap(
                example =>
                    [
                        {
                            speaker: 'human',
                            text: example,
                        },
                        {
                            speaker: 'assistant',
                            text: `<classification>${id}</classification>`,
                        },
                    ] as const
            )
        )

        return messages
    }

    public async classifyIntentFromOptions(
        input: string,
        options: IntentClassificationOption[]
    ): Promise<string | null> {
        const initialPrompt = this.buildInitialPrompt(options)
        const exampleTranscript = this.buildExampleTranscript(options)

        const result = await this.completionsClient.complete({
            fast: true,
            temperature: 0.2,
            maxTokensToSample: ANSWER_TOKENS,
            topK: -1,
            topP: -1,
            messages: [
                {
                    speaker: 'human',
                    text: initialPrompt,
                },
                {
                    speaker: 'assistant',
                    text: 'Ok.',
                },
                ...exampleTranscript,
                {
                    speaker: 'human',
                    text: input,
                },
                {
                    speaker: 'assistant',
                },
            ],
        })

        const responseClassification = result.completion.match(/<classification>(.*?)<\/classification>/)?.[1]

        if (!responseClassification) {
            return null
        }

        return options.find(option => option.id === responseClassification)?.id ?? null
    }
}

const prompt = `
You are an AI chatbot in a code editor. You are at expert at understanding the request of a software developer and selecting an available function to perform that request.
Think step-by-step to understand the request.
Only provide your response if you know the answer or can make a well-informed guess, respond with "unknown".
Enclose your response in <classification></classification> XML tags. Do not provide anything else.

Available functions:
{functions}
`
