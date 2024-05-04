import type Anthropic from '@anthropic-ai/sdk'
import type { Action } from './action'
import { extractXML } from './util'

interface BotMessage {
    role: 'bot'
    text: string
}

interface UserMessage {
    role: 'user'
    text: string
}

type Interaction = [UserMessage, BotMessage | null]

export interface Memory {
    transcript: Interaction[]
    actions: Action[]
}

export interface Environment {
    todo?: undefined
}

export interface HumanLink {
    ask(proposedAction: Action): Promise<void>
}

interface NodeArg {
    name: string
    value: string
}

interface Node {
    /**
     * Executes the node, resulting in an action (side-effect mutation to memory) and returns
     * the next node or null if we are done
     */
    do(human: HumanLink, env: Environment, memory: Memory, anthropic: Anthropic): Promise<Node | null>

    getArgs(): NodeArg[]
    updateArgs(args: NodeArg[]): void
}

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
        const messagePromise = anthropic.messages.create({
            max_tokens: 1024,
            messages: [{ role: 'user', content: text }],
            // model: 'claude-3-opus-20240229',
            model: 'claude-3-haiku-20240307',
        })

        const message = await messagePromise
        if (message.content.length === 0 || message.content.length > 1) {
            throw new Error(
                `expected exactly one text block in claude response, got ${message.content.length})`
            )
        }
        const rawResponse = message.content[0].text
        const existingBehavior = extractXML(rawResponse, 'existingBehavior')
        const desiredBehavior = extractXML(rawResponse, 'desiredBehavior')
        const restatement = `${existingBehavior}\n\n${desiredBehavior}`

        memory.actions.push({ level: 0, type: 'restate', output: restatement })

        return new ContextualizeNode()
    }
}

class ContextualizeNode implements Node {
    getArgs(): NodeArg[] {
        return []
    }
    updateArgs(args: NodeArg[]): void {}
    public async do(
        human: HumanLink,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<Node | null> {
        console.log('# waiting approval for Contextualize')
        await human.ask({
            level: 0,
            type: 'contextualize',
            output: [],
        })
        console.log('# finished Contextualize!')
        return null
    }
}

export class StateMachine {
    private currentNode: Node
    constructor(startNode: Node) {
        this.currentNode = startNode
    }

    /**
     * @returns true if done, false otherwise
     */
    public async step(
        human: HumanLink,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<boolean> {
        const nextNode = await this.currentNode.do(human, env, memory, anthropic)
        if (nextNode) {
            this.currentNode = nextNode
            return false
        }
        return true
    }
}
