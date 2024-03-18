import type { AutocompleteTimeouts, CodeCompletionsParams } from '@sourcegraph/cody-shared'

import type { ProviderOptions } from './provider'

export const MAX_RESPONSE_TOKENS = 256

type LineNumberDependentCompletionParams = Required<
    Pick<CodeCompletionsParams, 'maxTokensToSample' | 'stopSequences' | 'timeoutMs'>
>

interface LineNumberDependentCompletionParamsByType {
    singlelineParams: LineNumberDependentCompletionParams
    multilineParams: LineNumberDependentCompletionParams
}

interface Params {
    singlelineStopSequences: string[]
    multilineStopSequences: string[]
}

export function getLineNumberDependentCompletionParams(
    params: Params
): LineNumberDependentCompletionParamsByType {
    const { singlelineStopSequences, multilineStopSequences } = params

    return {
        singlelineParams: {
            timeoutMs: 15_000,
            stopSequences: singlelineStopSequences,
            maxTokensToSample: MAX_RESPONSE_TOKENS,
        },
        multilineParams: {
            timeoutMs: 15_000,
            stopSequences: multilineStopSequences,
            maxTokensToSample: MAX_RESPONSE_TOKENS,
        },
    }
}

interface GetCompletionParamsAndFetchImplParams {
    providerOptions: Readonly<ProviderOptions>
    lineNumberDependentCompletionParams: LineNumberDependentCompletionParamsByType
    timeouts?: AutocompleteTimeouts | undefined
}

export function getCompletionParams(
    params: GetCompletionParamsAndFetchImplParams
): Omit<CodeCompletionsParams, 'messages'> {
    const {
        timeouts,
        providerOptions: { multiline: isMultiline, hotStreak },
        lineNumberDependentCompletionParams: { singlelineParams, multilineParams },
    } = params

    const useExtendedGeneration = isMultiline || hotStreak

    const partialRequestParams = {
        ...(useExtendedGeneration ? multilineParams : singlelineParams),
        temperature: 0.2,
        topK: 0,
    } satisfies Omit<CodeCompletionsParams, 'messages'>

    // Apply custom multiline timeouts if they are defined.
    if (timeouts?.multiline && useExtendedGeneration) {
        partialRequestParams.timeoutMs = timeouts.multiline
    }

    // Apply custom singleline timeouts if they are defined.
    if (timeouts?.singleline && !useExtendedGeneration) {
        partialRequestParams.timeoutMs = timeouts.singleline
    }

    return partialRequestParams
}
