import { HooksExecutor } from '../hooks/executor'
import { ANSWER_TOKENS } from '../prompt/constants'
import { Message } from '../sourcegraph-api'
import type { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'
import type { CompletionCallbacks, CompletionParameters } from '../sourcegraph-api/completions/types'

import { createTypewriter } from './typewriter'

type ChatParameters = Omit<CompletionParameters, 'messages'>

const DEFAULT_CHAT_COMPLETION_PARAMETERS: ChatParameters = {
    temperature: 0.2,
    maxTokensToSample: ANSWER_TOKENS,
    topK: -1,
    topP: -1,
}

export class ChatClient {
    constructor(private completions: SourcegraphCompletionsClient, private hooks: Pick<HooksExecutor, 'preChat'>) {}

    public async chat(
        messages: Message[],
        cb: CompletionCallbacks,
        params?: Partial<ChatParameters>
    ): Promise<() => void> {
        const isLastMessageFromHuman = messages.length > 0 && messages[messages.length - 1].speaker === 'human'
        messages = isLastMessageFromHuman ? messages.concat([{ speaker: 'assistant' }]) : messages
        messages = await this.hooks.preChat(messages)

        const typewriter = createTypewriter({
            emit: cb.onChange,
        })

        return this.completions.stream(
            {
                ...DEFAULT_CHAT_COMPLETION_PARAMETERS,
                ...params,
                messages,
            },
            {
                ...cb,
                onChange: typewriter.write,
                onComplete: () => {
                    typewriter.stop()
                    cb.onComplete()
                },
            }
        )
    }
}
