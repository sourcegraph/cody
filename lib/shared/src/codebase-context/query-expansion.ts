import { ChatClient } from '../chat/chat'

import { ContextMessage } from './messages'

export class QueryExpander {
    constructor(private chatClient: ChatClient) {}

    public async expandQuery(query: string, pseudoRelevantContextMessages: ContextMessage[]): Promise<string> {
        const promptContext = pseudoRelevantContextMessages
            .filter(message => message.speaker === 'human')
            .map(message => message.text ?? '')
            .join('\n\n')

        const passage = await new Promise<string>((resolve, reject) => {
            let responseText = ''
            this.chatClient?.chat(
                [
                    {
                        speaker: 'human',
                        text: expandQueryWithContextPrompt
                            .replace('{context}', promptContext)
                            .replace('{query}', query),
                    },
                    { speaker: 'assistant', text: 'Passage:' },
                ],
                {
                    onChange: (text: string) => {
                        responseText = text
                    },
                    onComplete: () => {
                        resolve(responseText.trim())
                    },
                    onError: (error: Error) => reject(error),
                },
                {
                    temperature: 0,
                    fast: true,
                }
            )
        })

        return passage
    }
}

const expandQueryWithContextPrompt = `Write a passage that answers the given query based on the context:
Context: {context}
Query: {query}
`
