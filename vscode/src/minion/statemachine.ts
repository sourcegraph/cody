import type Anthropic from '@anthropic-ai/sdk'
import type { Action, ActionStatus } from './action'
import type { Environment } from './environment'

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

export interface HumanLink {
    ask(proposedAction: Action): Promise<void>
    report(action: Action, status: Exclude<ActionStatus, 'pending'>, message: string): void
}

export interface NodeArg {
    name: string
    value: string
}

export interface Node {
    /**
     * Executes the node, resulting-effect mutation to memory) and returns
     * the next node or null if we are done
     */
    do(human: HumanLink, env: Environment, memory: Memory, anthropic: Anthropic): Promise<Node | null>

    getArgs(): NodeArg[]
    updateArgs(args: NodeArg[]): void
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
