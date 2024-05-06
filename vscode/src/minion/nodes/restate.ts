import type { HumanLink, Memory, Node, NodeArg } from '../statemachine'

import type Anthropic from '@anthropic-ai/sdk'
import type { Environment } from '../environment'
import { extractXMLFromAnthropicResponse } from '../util'
import { ContextualizeNode } from './contextualize'

export class RestateNode implements Node {
    constructor(private description: string) {}

    public getArgs(): NodeArg[] {
        return [
            {
                name: 'Original description',
                value: this.description,
            },
        ]
    }

    public updateArgs(args: NodeArg[]): void {
        for (const arg of args) {
            if (arg.name === 'Original description') {
                this.description = arg.value
            }
        }
    }

    public async do(
        human: HumanLink,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<Node> {
        const text = `
I'd like help performing the following task:
<taskDescription>
${this.description}
</taskDescription>

First, restate the task in terms of the following format:
<existingBehavior>a detailed description of the existing behavior</existingBehavior>
<desiredBehavior>a detailed description of the new behavior</desiredBehavior>`.trimStart()
        memory.transcript.push([
            {
                role: 'user',
                text,
            },
            null,
        ])

        // TODO(beyang): postUpdateActions, indicating in-progress action
        // make llm request
        const message = await anthropic.messages.create({
            max_tokens: 1024,
            messages: [{ role: 'user', content: text }],
            model: 'claude-3-haiku-20240307',
        })

        const existingBehavior = extractXMLFromAnthropicResponse(message, 'existingBehavior')
        const desiredBehavior = extractXMLFromAnthropicResponse(message, 'desiredBehavior')
        const restatement = `${existingBehavior}\n\n${desiredBehavior}`

        memory.actions.push({ level: 0, type: 'restate', output: restatement })

        return new ContextualizeNode()
    }
}
