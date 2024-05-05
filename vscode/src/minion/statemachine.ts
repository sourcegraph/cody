import type Anthropic from '@anthropic-ai/sdk'
import type * as vscode from 'vscode'
import type { Action } from './action'
import { Environment } from './environment'
import { generateQueriesSystem, generateQueriesUser } from './prompts'
import { extractXMLFromAnthropicResponse } from './util'

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
t
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
        const message = await anthropic.messages.create({
            max_tokens: 1024,
            messages: [{ role: 'user', content: text }],
            // model: 'claude-3-opus-20240229',
            model: 'claude-3-haiku-20240307',
        })

        const existingBehavior = extractXMLFromAnthropicResponse(message, 'existingBehavior')
        const desiredBehavior = extractXMLFromAnthropicResponse(message, 'desiredBehavior')
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

        let issueDescription = undefined
        for (const action of memory.actions.toReversed()) {
            if (action.type === 'restate') {
                issueDescription = action.output
                break
            }
        }
        if (issueDescription === undefined) {
            throw new Error('could not find Restate in previous actions')
        }

        // Generate symf search queries
        const system = generateQueriesSystem
        const message = await anthropic.messages.create({
            system,
            max_tokens: 4096,
            messages: generateQueriesUser(issueDescription),
            model: 'claude-3-haiku-20240307',
        })
        const rawQueries = extractXMLFromAnthropicResponse(message, 'searcQueries')
        const queries = rawQueries?.split('\n').map(line => line.split(' ').map(k => k.trim()))

        // Issue searches through symf

        // LLM reranking

        // Memorize most relevant snippets

        // Display relevant snippets with commentary

        // Explain existing behavior

        // Propose what needs to be changed

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
