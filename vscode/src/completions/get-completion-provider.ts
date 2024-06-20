import type { DocumentContext } from '@sourcegraph/cody-shared'

import { completionProviderConfig } from './completion-provider-config'
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
    } = params

    const sharedProviderOptions: Omit<ProviderOptions, 'id' | 'n' | 'multiline'> = {
        triggerKind,
        docContext,
        document,
        position,
        hotStreak: completionProviderConfig.hotStreak,
        // For now the value is static and based on the average multiline completion latency.
        firstCompletionTimeout,
        completionLogId,
    }

    // Show more if manually triggered (but only showing 1 is faster, so we use it
    // in the automatic trigger case).
    const n = triggerKind === TriggerKind.Automatic ? 1 : 3

    return providerConfig.create({
        ...sharedProviderOptions,
        n,
        multiline: !!docContext.multilineTrigger,
    })
}
