import { Transcript } from '@sourcegraph/cody-shared/src/chat/transcript'
import { ANSWER_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import { CompletionParameters } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { debugLog } from '../log'
import { GlobalOptions } from '../program'

import { Client, getClient } from '.'
import { interactionFromMessage } from './interactions'
import { getPreamble } from './preamble'

const DEFAULT_CHAT_COMPLETION_PARAMETERS: Omit<CompletionParameters, 'messages'> = {
    temperature: 0.2,
    maxTokensToSample: ANSWER_TOKENS,
    topK: -1,
    topP: -1,
}

export async function getCompletion(
    client: Pick<SourcegraphCompletionsClient, 'complete'>,
    messages: Message[]
): Promise<string> {
    const response = await client.complete({ messages, ...DEFAULT_CHAT_COMPLETION_PARAMETERS })
    return response.completion
}

export async function getCompletionWithContext(
    clientOrGlobalOptions: Client | GlobalOptions,
    humanMessage: string,
    assistantMessage: string | undefined,
    debug: boolean
): Promise<string> {
    const client = 'debug' in clientOrGlobalOptions ? await getClient(clientOrGlobalOptions) : clientOrGlobalOptions

    const transcript = new Transcript()

    const messages: { human: Message; assistant?: Message }[] = [
        {
            human: { speaker: 'human', text: humanMessage },
            assistant: assistantMessage
                ? {
                      speaker: 'assistant',
                      text: assistantMessage,
                  }
                : undefined,
        },
    ]
    for (const [index, message] of messages.entries()) {
        const interaction = await interactionFromMessage(
            message.human,
            client.intentDetector,
            // Fetch codebase context only for the last message
            index === messages.length - 1 ? client.codebaseContext : null
        )

        transcript.addInteraction(interaction)

        if (message.assistant?.text) {
            transcript.addAssistantResponse(message.assistant?.text)
        }
    }

    const { prompt: finalPrompt, contextFiles } = await transcript.getPromptForLastInteraction(
        getPreamble(client.codebaseContext.getCodebase())
    )
    debugLog(debug, 'Context files', contextFiles.map(({ fileName }) => fileName).join('\n'))
    transcript.setUsedContextFilesForLastInteraction(contextFiles)

    return getCompletion(client.completionsClient, finalPrompt)
}
