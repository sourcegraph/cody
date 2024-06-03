import type Anthropic from '@anthropic-ai/sdk'
import type { CancellationToken } from 'vscode'
import type { Step } from '../action'
import type { Environment } from '../environment'
import type { BlockResult, Memory } from '../statemachine'

/**
 * Encapsulates the state needed to run a single step of the plan
 */
export async function runStep(
    cancelToken: CancellationToken,
    step: Step,
    env: Environment,
    memory: Memory,
    anthropic: Anthropic
): Promise<BlockResult> {
    switch (step.stepId) {
        case 'update-changelog': {
            return { status: 'done', error: 'Not implemented' }
        }
        default: {
            return { status: 'done', error: 'Not implemented' }
        }
    }
}
