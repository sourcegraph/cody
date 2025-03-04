import {
    type CompletionParameters,
    type ModelContextWindow,
    modelsService,
} from '@sourcegraph/cody-shared'
import type { FixupTask } from '../../non-stop/FixupTask'

export interface ModelParametersInput {
    model: string
    stopSequences?: string[]
    contextWindow: ModelContextWindow
    task: FixupTask
}

export interface ModelParameterProvider {
    getModelParameters(args: ModelParametersInput): CompletionParameters
}

export class DefaultModelParameterProvider implements ModelParameterProvider {
    getModelParameters(args: ModelParametersInput): CompletionParameters {
        const params = {
            model: args.model,
            stopSequences: args.stopSequences,
            maxTokensToSample: args.contextWindow.output,
        } as CompletionParameters

        if (args.model.includes('gpt-4o')) {
            // Use Predicted Output for gpt-4o models.
            // https://platform.openai.com/docs/guides/predicted-outputs
            params.prediction = {
                type: 'content',
                content: args.task.original,
            }
        }

        if (modelsService.isStreamDisabled(args.model)) {
            params.stream = false
        }
        return params
    }
}
