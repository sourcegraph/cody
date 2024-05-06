import type Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources'
import { isBoolean } from 'lodash'
import type { Action, Step } from '../action'
import type { Environment } from '../environment'
import * as prompts from '../prompts'
import type { HumanLink, Memory, Node, NodeArg } from '../statemachine'
import { extractXMLArrayFromAnthropicResponse, extractXMLFromAnthropicResponse } from '../util'

interface SubAction {
    readonly type: string
    readonly docs: string
    do(
        human: HumanLink,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<{ observation: string; done: 'pass' | 'fail' | null }>
}

function parseSubAction(rawSubAction: string): SubAction {
    throw new Error('Method not implemented.')
}

const stateCommand = `
state() {
  local working_dir="$PWD";
  if [ -z $CURRENT_FILE ]; then
    echo '{"open_file": "n/a", "working_dir": "'$working_dir'"}';
  else
    echo '{"open_file": "'$(realpath $CURRENT_FILE)'", "working_dir": "'$working_dir'"}';
  fi
};`.trimStart()

// open
// scroll to
// edit
// create
// edit
// run terminal
// search
// submit

// # @yaml
// # signature: search_dir <search_term> [<dir>]
// # docstring: searches for search_term in all files in dir. If dir is not provided, searches in the current directory
// # arguments:
// #   search_term:
// #     type: string
// #     description: the term to search for
// #     required: true
// #   dir:
// #     type: string
// #     description: the directory to search in (if not provided, searches in the current directory)
// #     required: false

export class DoPlanStep implements Node {
    public async do(
        human: HumanLink,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<Node | null> {
        // Find plan
        let planIndex = -1
        let planSteps: Step[] | undefined = undefined
        for (let i = memory.actions.length - 1; i >= 0; i--) {
            const action = memory.actions[i]
            if (action.type === 'plan') {
                planIndex = i
                planSteps = action.steps
                break
            }
        }
        if (planIndex === -1 || planSteps === undefined) {
            throw new Error('could not find Plan steps in previous actions')
        }

        // Find last step from plan
        let stepIndex = 0
        for (let i = planIndex + 1; i < memory.actions.length; i++) {
            const action = memory.actions[i]
            if (action.type === 'do-step') {
                stepIndex++
            }
        }

        if (stepIndex >= planSteps.length) {
            throw new Error('step index beyond length of plan')
        }
        const step = planSteps[stepIndex]

        const proposedAction: Action = {
            level: 0,
            type: 'do-step',
            step,
            ordinal: stepIndex + 1,
            subactions: [],
        }
        await human.ask(proposedAction)

        let delegateToUser = false
        try {
            const shouldAskUserResp = await anthropic.messages.create({
                system: prompts.shouldAskHumanSystem,
                model: 'claude-3-haiku-20240307',
                max_tokens: 4096,
                messages: prompts.shouldAskHumanUser(step.description),
            })
            const shouldAskUserRaw = extractXMLFromAnthropicResponse(shouldAskUserResp, 'humanIsBetter')
            const shouldAskAIRaw = extractXMLFromAnthropicResponse(shouldAskUserResp, 'aiIsBetter')
            const shouldAskUser = JSON.parse(shouldAskUserRaw)
            const shouldAskAI = JSON.parse(shouldAskAIRaw)
            if (!isBoolean(shouldAskUser) || !isBoolean(shouldAskAI)) {
                throw new Error(
                    `could not parse bool from these values: ${shouldAskUserRaw}, ${shouldAskAIRaw}`
                )
            }
            if (shouldAskAI !== shouldAskUser) {
                throw new Error(`shouldAskAI (${shouldAskAI}) === shouldAskUser (${shouldAskUser})`)
            }
            delegateToUser = shouldAskUser
        } catch (e) {
            console.error(`error detecting if should go with ai or user: ${e}`)
        }

        if (delegateToUser) {
            console.log('#### HERE delegateToUser')
        }

        // TODO(beyang): currently open file, terminal handle

        let obs = null
        const subactions: SubAction[] = []
        const maxIters = 20
        const transcript: MessageParam[] = []
        let finishedStatus: 'terminated' | 'pass' | 'fail' = 'terminated'
        const window = 100
        const commandDocs = 'TODO'
        const systemPrompt = prompts.taoSystem(commandDocs, window)

        // NEXT: get state by running terminal command
        const out = env.terminal(stateCommand)
        for (let i = 0; i < maxIters; i++) {
            const { action: rawSubAction, thought } = await this.think(
                obs,
                subactions,
                'TODO:state',
                systemPrompt,
                transcript,
                { anthropic }
            )

            console.log('# tao', thought, rawSubAction)
            const { observation: newObs, done } = await this.act(
                rawSubAction,
                human,
                env,
                memory,
                anthropic
            )
            console.log('# new obs', newObs)
            obs = newObs

            if (done) {
                finishedStatus = done
                break
            }
        }

        // Return next step of plan or submit DisplayPatch node if done

        return null
    }

    private async think(
        observation: string | null,
        subactions: SubAction[],
        state: string,
        systemPrompt: string,
        transcript: MessageParam[],
        llms: { anthropic: Anthropic }
    ): Promise<{ thought: string; action: string }> {
        console.log('# DoPlanStep.think', observation, subactions, state)
        const responseMessage = llms.anthropic.messages.create({
            system: systemPrompt,
            max_tokens: 4096,
            messages: transcript,
            model: 'claude-3-opus-20240229',
        })
        console.log('# responseMessage', responseMessage)
        return {
            thought: 'this is a thought',
            action: 'do x',
        }
    }

    private async act(
        rawSubAction: string,
        human: HumanLink,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ): Promise<{ observation: string; done: 'pass' | 'fail' | null }> {
        const subaction = parseSubAction(rawSubAction)
        const { observation, done } = await subaction.do(human, env, memory, anthropic)
        return { observation, done }
    }

    getArgs(): NodeArg[] {
        throw new Error('Method not implemented.')
    }
    updateArgs(args: NodeArg[]): void {
        throw new Error('Method not implemented.')
    }
}
