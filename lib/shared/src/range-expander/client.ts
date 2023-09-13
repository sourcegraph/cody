import { ANSWER_TOKENS } from '../prompt/constants'
import { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'

import { RangeExpander } from '.'

export class SourcegraphFixupRangeExpander implements RangeExpander {
    constructor(private completionsClient?: SourcegraphCompletionsClient) {}

    // private buildInitialTranscript(options: IntentClassificationOption[]): Message[] {
    //     const functions = options
    //         .map(({ id, description }) => `Function ID: ${id}\nFunction Description: ${description}`)
    //         .join('\n')

    //     return [
    //         {
    //             speaker: 'human',
    //             text: prompt.replace('{functions}', functions),
    //         },
    //         {
    //             speaker: 'assistant',
    //             text: 'Ok.',
    //         },
    //     ]
    // }

    // private buildExampleTranscript(options: IntentClassificationOption[]): Message[] {
    //     const messages = options.flatMap(({ id, examplePrompts }) =>
    //         examplePrompts.flatMap(
    //             example =>
    //                 [
    //                     {
    //                         speaker: 'human',
    //                         text: example,
    //                     },
    //                     {
    //                         speaker: 'assistant',
    //                         text: `<classification>${id}</classification>`,
    //                     },
    //                 ] as const
    //         )
    //     )

    //     return messages
    // }

    public async expandTheContextRange(input: string): Promise<string> {
        // const matchingRawCommand = options.find(option => input.startsWith(option.rawCommand))
        // if (matchingRawCommand) {
        //     // Matching command (e.g. /edit), so skip the LLM and return the intent.
        //     return matchingRawCommand.id
        // }

        const completionsClient = this.completionsClient
        if (!completionsClient) {
            return 'nothing'
        }

        const result = await new Promise<string>(resolve => {
            let responseText = ''
            return completionsClient.stream(
                {
                    fast: true,
                    temperature: 0,
                    maxTokensToSample: ANSWER_TOKENS,
                    topK: -1,
                    topP: -1,
                    messages: [
                        {
                            speaker: 'human',
                            text: input,
                        },
                        {
                            speaker: 'assistant',
                        },
                    ],
                },
                {
                    onChange: (text: string) => {
                        responseText = text
                    },
                    onComplete: () => {
                        resolve(responseText)
                    },
                    onError: (message: string, statusCode?: number) => {
                        console.error(`Error detecting intent: Status code ${statusCode}: ${message}`)
                        resolve('')
                    },
                }
            )
        })
        console.log('Result:', result)

        return result
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
