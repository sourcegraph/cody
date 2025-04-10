import { LongTermPromptStrategy } from './long-prompt-experimental'
import { AutoEditsModelConfig } from '@sourcegraph/cody-shared'
import { AutoeditsUserPromptStrategy } from './base'
import { PromptCacheOptimizedV1 } from './prompt-cache-optimized-v1'

export function createPromptProvider({
    promptProvider
}: {
    promptProvider?: AutoEditsModelConfig['promptProvider']
}): AutoeditsUserPromptStrategy {
    switch (promptProvider) {
        case 'long-suggestion-prompt-provider':
            return new LongTermPromptStrategy()
        default:
            return new PromptCacheOptimizedV1()
    }
}
