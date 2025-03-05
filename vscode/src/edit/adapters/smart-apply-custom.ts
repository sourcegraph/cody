import type { CompletionParameters } from '@sourcegraph/cody-shared'
import type { ModelParameterProvider } from './base'
import type { ModelParametersInput } from './base'

export class SmartApplyCustomModelParameterProvider implements ModelParameterProvider {
    getModelParameters(args: ModelParametersInput): CompletionParameters {
        const smartApplyMetadata = args.task.smartApplyMetadata
        if (!smartApplyMetadata) {
            throw new Error('Smart apply metadata is required for smart apply custom model')
        }

        const params = {
            model: args.model,
            stopSequences: args.stopSequences,
            maxTokensToSample: args.contextWindow.output,
            temperature: 0.1,
            stream: true,
            prediction: {
                type: 'content',
                content: smartApplyMetadata.replacementCodeBlock.toString(),
            },
            rewriteSpeculation: true,
            adaptiveSpeculation: true,
        } as CompletionParameters

        return params
    }
}
