import type { HumanLink, Memory, Node, NodeArg } from '../statemachine'
import { PlanNode } from './plan'

import type Anthropic from '@anthropic-ai/sdk'
import type { Action } from '../action'
import type { Environment, TextSnippet } from '../environment'
import {
    generateQueriesSystem,
    generateQueriesUser,
    isRelevantSnippetSystem,
    isRelevantSnippetUser,
} from '../prompts'
import { extractXMLFromAnthropicResponse } from '../util'

export class ContextualizeNode implements Node {
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
            output: relevantResults.map(result => {
                return {
                    source: {
                        uri: result.uri,
                        range: result.range,
                    },
                    text: result.text,
                    comment: '', // TODO(beyang): annotate each snippet with commentary tying it to the issue description
                }
            }),
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
