import { type CompletionParameters, modelsService } from '@sourcegraph/cody-shared'
import type { ModelParameterProvider, ModelParametersInput } from './base'

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
