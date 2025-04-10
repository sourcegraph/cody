import type { AutoEditsModelConfig } from '@sourcegraph/cody-shared'
import type { AutoeditsUserPromptStrategy } from './base'
import { LongTermPromptStrategy } from './long-prompt-experimental'
import { PromptCacheOptimizedV1 } from './prompt-cache-optimized-v1'

export function createPromptProvider({
    promptProvider,
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
