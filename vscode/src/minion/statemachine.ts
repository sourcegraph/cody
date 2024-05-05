import type Anthropic from '@anthropic-ai/sdk'
import type { Action, ActionStatus } from './action'
import type { Environment, TextSnippet } from './environment'
import {
    generateQueriesSystem,
    generateQueriesUser,
    isRelevantSnippetSystem,
    isRelevantSnippetUser,
} from './prompts'
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

export interface HumanLink {
    ask(proposedAction: Action): Promise<void>
    report(action: Action, status: Exclude<ActionStatus, 'pending'>, message: string): void
}

interface NodeArg {
    name: string
    value: string
}

interface Node {
    /**
     * Executes the node, resulting-effect mutation to memory) and returns
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
        const proposedAction: Action = {
            level: 0,
            type: 'contextualize',
            output: [],
        }
        await human.ask(proposedAction)
        human.report(proposedAction, 'in-progress', '')

        let issueDescriptionMaybe = undefined
        for (const action of memory.actions.toReversed()) {
            if (action.type === 'restate') {
                issueDescriptionMaybe = action.output
                break
            }
        }
        if (issueDescriptionMaybe === undefined) {
            throw new Error('could not find Restate in previous actions')
        }
        const issueDescription: string = issueDescriptionMaybe

        // Generate symf search queries
        const system = generateQueriesSystem
        const message = await anthropic.messages.create({
            system,
            max_tokens: 4096,
            messages: generateQueriesUser(issueDescription),
            model: 'claude-3-haiku-20240307',
        })
        const rawQueries = extractXMLFromAnthropicResponse(message, 'searchQueries')
        const queries = rawQueries?.split('\n').map(line => line.split(' ').map(k => k.trim()))

        // Issue searches through symf
        const allResults = []
        for (const query of queries) {
            const results = await env.search(query.join(' '))
            allResults.push(...results)
        }

        console.log('# allResults', allResults)

        // LLM reranking
        const allResultsRelevant = await Promise.all(
            allResults.map(
                async (result: TextSnippet): Promise<[TextSnippet, boolean]> => [
                    result,
                    await ContextualizeNode.isRelevantSnippet(issueDescription, result, anthropic),
                ]
            )
        )
        const relevantResults = allResultsRelevant
            .filter(([_, isRelevant]) => isRelevant)
            .map(([result]) => result)

        console.log('# relevantResults', relevantResults)

        // Record relevant snippets as action
        memory.actions.push({
            level: 0,
            type: 'contextualize',
            output: relevantResults.map(result => ({
                source: result.uri.path,
                text: result.text,
                comment: '', // TODO(beyang): annotate each snippet with commentary tying it to the issue description
            })),
        })
        human.report(proposedAction, 'completed', '')

        return new PlanNode()
    }

    private static async isRelevantSnippet(
        taskDescription: string,
        result: TextSnippet,
        anthropic: Anthropic
    ): Promise<boolean> {
        const message = await anthropic.messages.create({
            system: isRelevantSnippetSystem,
            max_tokens: 4096,
            messages: isRelevantSnippetUser(taskDescription, result.uri.path, result.text),
            model: 'claude-3-haiku-20240307',
        })
        const rawShouldModify = extractXMLFromAnthropicResponse(message, 'shouldModify')
        return rawShouldModify.toLowerCase() === 'true'
    }
}

class PlanNode implements Node {
    public async do(
        human: HumanLink,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<Node | null> {
        console.log('### running plan')
        return null
    }
    public getArgs(): NodeArg[] {
        throw new Error('Method not implemented.')
    }
    public updateArgs(args: NodeArg[]): void {
        throw new Error('Method not implemented.')
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
