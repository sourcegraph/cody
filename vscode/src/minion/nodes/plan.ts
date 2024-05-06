import type { HumanLink, Memory, Node, NodeArg } from '../statemachine'

import type Anthropic from '@anthropic-ai/sdk'
import type { Action } from '../action'
import type { Environment } from '../environment'
import * as prompts from '../prompts'
import { extractXMLArray, extractXMLFromAnthropicResponse, mustExtractXML } from '../util'
import { DoPlanStep } from './do-step'

export class PlanNode implements Node {
    public async do(
        human: HumanLink,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<Node | null> {
        const proposedAction: Action = {
            level: 0,
            type: 'plan',
            steps: [],
        }
        await human.ask(proposedAction)
        human.report(proposedAction, 'in-progress', '')

        let spec = undefined
        for (const action of memory.actions.toReversed()) {
            if (action.type === 'restate') {
                spec = action.output
                break
            }
        }
        if (!spec) {
            throw new Error('could not find Restate in previous actions')
        }

        let context = undefined
        for (const action of memory.actions.toReversed()) {
            if (action.type === 'contextualize') {
                context = action.output
                break
            }
        }
        if (!context) {
            throw new Error('could not find Contextualize in previous actions')
        }

        const system = prompts.planSystem
        const message = await anthropic.messages.create({
            system,
            max_tokens: 4096,
            messages: prompts.planUser(spec, context),
            model: 'claude-3-haiku-20240307',
        })

        const rawPlan = extractXMLFromAnthropicResponse(message, 'plan')
        const steps = extractXMLArray(rawPlan, 'step').map(rawStep => {
            return {
                description: mustExtractXML(rawStep, 'description'),
                title: mustExtractXML(rawStep, 'title'),
            }
        })

        console.log('# steps', steps)

        // Record relevant steps as action
        memory.actions.push({
            level: 0,
            type: 'plan',
            steps,
        })
        human.report(proposedAction, 'completed', '')

        return new DoPlanStep()
    }
    public getArgs(): NodeArg[] {
        throw new Error('Method not implemented.')
    }
    public updateArgs(args: NodeArg[]): void {
        throw new Error('Method not implemented.')
    }
}
