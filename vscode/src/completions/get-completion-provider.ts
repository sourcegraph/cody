import type { DocumentContext, GitContext } from '@sourcegraph/cody-shared'

import { type InlineCompletionsParams, TriggerKind } from './get-inline-completions'
import type { CompletionLogID } from './logger'
import type { Provider, ProviderOptions } from './providers/provider'

interface GetCompletionProvidersParams
    extends Pick<
        InlineCompletionsParams,
        'document' | 'position' | 'triggerKind' | 'providerConfig' | 'firstCompletionTimeout'
    > {
    docContext: DocumentContext
    completionLogId: CompletionLogID
    gitContext?: GitContext
}

export function getCompletionProvider(params: GetCompletionProvidersParams): Provider {
    const {
        document,
        position,
        triggerKind,
        providerConfig,
        docContext,
        firstCompletionTimeout,
        completionLogId,
        gitContext,
    } = params

    const sharedProviderOptions: Omit<ProviderOptions, 'id' | 'n' | 'multiline'> = {
        triggerKind,
        docContext,
        document,
        position,
        // For now the value is static and based on the average multiline completion latency.
        firstCompletionTimeout,
        completionLogId,
        gitContext,
    }

    // Show more if manually triggered (but only showing 1 is faster, so we use it
    // in the automatic trigger case).
    const n = triggerKind === TriggerKind.Automatic || triggerKind === TriggerKind.Preload ? 1 : 3

    return providerConfig.create({
        ...sharedProviderOptions,
        n,
        multiline: !!docContext.multilineTrigger,
    })
}
