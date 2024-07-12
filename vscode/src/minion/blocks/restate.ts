import type { Block, BlockResult, Memory } from '../statemachine'

import type Anthropic from '@anthropic-ai/sdk'
import type { CancellationToken } from 'vscode'
import type { Environment } from '../environment'
import { extractXMLFromAnthropicResponse } from '../util'

export const RestateBlock: Block = {
    id: 'restate',

    do: async (
        cancelToken: CancellationToken,
        _env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<BlockResult> => {
        let description: string | undefined
        for (const action of memory.getEvents().toReversed()) {
            if (action.type === 'describe') {
                description = action.description
            }
        }
        if (description === undefined) {
            throw new Error('could not find Describe in previous actions')
        }

        const text = `
I'd like help performing the following task:
<taskDescription>
${description}
</taskDescription>

First, restate the task in terms of the following format:
<existingBehavior>a detailed description of the existing behavior</existingBehavior>
<desiredBehavior>a detailed description of the new behavior</desiredBehavior>`.trimStart()

        const message = await anthropic.messages.create({
            max_tokens: 1024,
            messages: [{ role: 'user', content: text }],
            model: 'claude-3-haiku-20240307',
        })
        if (cancelToken.isCancellationRequested) {
            return { status: 'cancelled' }
        }

        const existingBehavior = extractXMLFromAnthropicResponse(message, 'existingBehavior')
        const desiredBehavior = extractXMLFromAnthropicResponse(message, 'desiredBehavior')
        const restatement = `${existingBehavior}\n\n${desiredBehavior}`

        memory.postEvent({ level: 0, type: 'restate', output: restatement })
        return { status: 'done' }
    },
}
