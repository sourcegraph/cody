import { XMLParser } from 'fast-xml-parser'

import {
    type ChatMessage,
    ContextItemSource,
    type ContextItemWithContent,
    ModelsService,
    PromptString,
    type SourcegraphCompletionsClient,
    getSimplePreamble,
    psDedent,
} from '@sourcegraph/cody-shared'
import { logDebug } from '../log'
import { PromptBuilder } from '../prompt-builder'

/**
 * Rewrite the query based on the conversation history and mentioned context items.
 */
export async function rewriteChatQuery({
    query,
    contextItems,
    chatMessages,
    completionsClient,
    modelID,
}: {
    query: PromptString
    contextItems: ContextItemWithContent[]
    chatMessages: readonly ChatMessage[]
    completionsClient: SourcegraphCompletionsClient
    modelID: string
}): Promise<PromptString> {
    try {
        const contextWindow = ModelsService.getContextWindowByID(modelID)
        const promptBuilder = new PromptBuilder(contextWindow)

        // Include simple preamble in the prompt.
        const preamble = getSimplePreamble(undefined, 0)
        if (!promptBuilder.tryAddToPrefix(preamble)) {
            return query
        }

        // Only include context items which are mentioned by the user.
        const mentions = contextItems.filter(item => item.source === ContextItemSource.User)

        // If it is the first question and there are no mention items return the original query.
        if (chatMessages.length < 2 && mentions.length === 0) {
            return query
        }

        // Include last 3 interactions from chat history if present.
        if (chatMessages.length > 1) {
            // chatMessages is readonly and should not me mutated.
            const chatMessagesToInclude = [...chatMessages]
            // Remove the latest chat message from the history.
            chatMessagesToInclude.pop()
            // Pass the messages in reverse order as expected by tryAddMessages and include only last 3 interactions.
            promptBuilder.tryAddMessages(chatMessagesToInclude.slice(-6).reverse())
        }

        // Add the message for rewriting the latest query.
        promptBuilder.tryAddMessages([
            {
                speaker: 'human',
                text: psDedent`
The user wants to search the codebase to get relevant files for their latest query.
Based on the chat history, rewrite the user's latest query by decontextualizing it and resolving all the coreferences and omission in the query without changing its meaning.

Obey the following criteria while rewriting the latest query:
1. You must retain the meaning the of query.
2. You must rewrite the query from user's perspective.
3. You must add detailed content related to the query from the context shared in the chat history.
4. You must include all the keywords in the query necessary to perform the codebase search based on the chat history.
5. You must resolve any pronouns or elliptical expressions present in the latest query based on the chat history.
6. You must address any coreferences or omissions by providing explicit references from the chat history.
7. You must put the rewritten query inside the <rewritten_query></rewritten_query> tags.
8. You must not generate any explaination and only respond with the rewritten query.

Rewrite the following latest query based on the chat history: <latest_query>${query}</latest_query>`,
            },
            { speaker: 'assistant' },
        ])

        /*
         * Include mention context items only after adding the latest user message,
         * so that the input tokens are counted, otherwise it throws.
         */
        await promptBuilder.tryAddContext('user', mentions)

        const messages = promptBuilder.build()

        const stream = completionsClient.stream(
            {
                messages,
                model: modelID,
                maxTokensToSample: 400,
                temperature: 0,
                topK: 1,
            },
            0 // Use legacy API version for now
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
        const parser = new XMLParser()
        const document = parser.parse(text)

        return document?.rewritten_query?.trim()
            ? PromptString.unsafe_fromLLMResponse(document.rewritten_query.trim())
            : query
    } catch (err) {
        logDebug('rewrite-chat-query', 'failed', { verbose: err })
        // If we fail to rewrite, just return the original query.
        return query
    }
}
