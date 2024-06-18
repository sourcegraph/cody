import type { Block, BlockResult, Memory } from '../statemachine'

import type Anthropic from '@anthropic-ai/sdk'
import * as uuid from 'uuid'
import type { CancellationToken } from 'vscode'
import type { Step } from '../action'
import type { Environment } from '../environment'
import * as prompts from '../prompts'
import { extractXMLArray, extractXMLFromAnthropicResponse, mustExtractXML } from '../util'

export class PlanBlock implements Block {
    public readonly id: string
    constructor() {
        this.id = `plan-${uuid.v4()}`
    }

    public async do(
        cancelToken: CancellationToken,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<BlockResult> {
        const steps = await this.computeSteps(cancelToken, env, memory, anthropic)
        if (cancelToken.isCancellationRequested) {
            return { status: 'cancelled' }
        }

        steps.push({
            title: 'Update the changelog',
            description: 'Update CHANGELOG.md to reflect this change',
            stepId: 'update-changelog',
        })

        // Record relevant steps as event
        memory.postEvent({
            level: 0,
            type: 'plan',
            blockid: this.id,
            steps,
        })
        return { status: 'done' }
    }

    private async computeSteps(
        cancelToken: CancellationToken,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<Step[]> {
        let spec = undefined
        for (const event of memory.getEvents().toReversed()) {
            if (event.type === 'restate') {
                spec = event.output
                break
            }
        }
        if (!spec) {
            throw new Error('could not find Restate in previous events')
        }

        let context = undefined
        for (const event of memory.getEvents().toReversed()) {
            if (event.type === 'contextualize') {
                context = event.output
                break
            }
        }
        if (!context) {
            throw new Error('could not find Contextualize in previous events')
        }

        if (cancelToken.isCancellationRequested) {
            return []
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
                stepId: uuid.v4(),
                description: mustExtractXML(rawStep, 'description'),
                title: mustExtractXML(rawStep, 'title'),
            }
        })

        return steps
    }
}
