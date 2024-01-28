import { ANSWER_TOKENS } from '../prompt/constants'
import type { Message } from '../sourcegraph-api'
import type { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'

import type { IntentClassificationOption, IntentDetector } from '.'

const editorRegexps = [
    /editor/,
    /(open|current|this|entire)\s+file/,
    /current(ly)?\s+open/,
    /have\s+open/,
]

export class SourcegraphIntentDetectorClient implements IntentDetector {
    constructor(private completionsClient?: SourcegraphCompletionsClient) {}

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

    private buildInitialTranscript(options: IntentClassificationOption[]): Message[] {
        const functions = options
            .map(({ id, description }) => `Function ID: ${id}\nFunction Description: ${description}`)
            .join('\n')

        return [
            {
                speaker: 'human',
                text: prompt.replace('{functions}', functions),
            },
            {
                speaker: 'assistant',
                text: 'Ok.',
            },
        ]
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

    public async classifyIntentFromOptions<Intent extends string>(
        input: string,
        options: IntentClassificationOption<Intent>[],
        fallback: Intent
    ): Promise<Intent> {
        const matchingRawCommand = options.find(option => input.startsWith(option.rawCommand))
        if (matchingRawCommand) {
            // Matching command (e.g. /edit), so skip the LLM and return the intent.
            return matchingRawCommand.id
        }

        const completionsClient = this.completionsClient
        if (!completionsClient) {
            return fallback
        }

        const preamble = this.buildInitialTranscript(options)
        const examples = this.buildExampleTranscript(options)

        let result = ''
        const stream = completionsClient.stream({
            fast: true,
            temperature: 0,
            maxTokensToSample: ANSWER_TOKENS,
            topK: -1,
            topP: -1,
            messages: [
                ...preamble,
                ...examples,
                {
                    speaker: 'human',
                    text: input,
                },
                {
                    speaker: 'assistant',
                },
            ],
        })
        for await (const message of stream) {
            switch (message.type) {
                case 'change': {
                    result = message.text
                    break
                }
                case 'error': {
                    console.error(
                        `Error detecting intent: Status code ${message.statusCode}: ${message.error.message}`
                    )
                    return fallback
                }
            }
        }

        const responseClassification = result.match(/<classification>(.*?)<\/classification>/)?.[1]
        if (!responseClassification) {
            return fallback
        }

        return options.find(option => option.id === responseClassification)?.id ?? fallback
    }
}

const prompt = `
You are an AI assistant in a text editor. You are at expert at understanding the request of a software developer and selecting an available function to perform that request.
Think step-by-step to understand the request.
Only provide your response if you know the answer or can make a well-informed guess, otherwise respond with "unknown".
Enclose your response in <classification></classification> XML tags. Do not provide anything else.

Available functions:
{functions}
`
