import { XMLParser } from 'fast-xml-parser'

import { type SourcegraphCompletionsClient } from '@sourcegraph/cody-shared'

export function symfExpandQuery(completionsClient: SourcegraphCompletionsClient, query: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const streamingText: string[] = []
        completionsClient.stream(
            {
                messages: [
                    {
                        speaker: 'human',
                        text: `You are helping the user search over a codebase. List some filename fragments that would match files relevant to read to answer the user's query. Present your results in an XML list in the following format: <keywords><keyword><value>a single keyword</value><variants>a space separated list of synonyms and variants of the keyword, including acronyms, abbreviations, and expansions</variants><weight>a numerical weight between 0.0 and 1.0 that indicates the importance of the keyword</weight></keyword></keywords>. Here is the user query: <userQuery>${query}</userQuery>`,
                    },
                    { speaker: 'assistant' },
                ],
                maxTokensToSample: 400,
                temperature: 0,
                topK: 1,
                fast: true,
            },
            {
                onChange(text) {
                    streamingText.push(text)
                },
                onComplete() {
                    const text = streamingText.at(-1) ?? ''
                    try {
                        const parser = new XMLParser()
                        const document = parser.parse(text)
                        const keywords: { value?: string; variants?: string; weight?: number }[] =
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                            document?.keywords?.keyword ?? []
                        const result = new Set<string>()
                        for (const { value, variants } of keywords) {
                            if (typeof value === 'string' && value) {
                                result.add(value)
                            }
                            if (typeof variants === 'string') {
                                for (const variant of variants.split(' ')) {
                                    if (variant) {
                                        result.add(variant)
                                    }
                                }
                            }
                        }
                        resolve([...result].sort().join(' '))
                    } catch (error) {
                        reject(error)
                    }
                },
                onError(error) {
                    reject(error)
                },
            }
        )
    })
}
