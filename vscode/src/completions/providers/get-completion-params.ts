import type { CodeCompletionsParams } from '@sourcegraph/cody-shared'

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
            timeoutMs: 7_000,
            stopSequences: singlelineStopSequences,
            maxTokensToSample: MAX_RESPONSE_TOKENS,
        },
        multilineParams: {
            timeoutMs: 7_000,
            stopSequences: multilineStopSequences,
            maxTokensToSample: MAX_RESPONSE_TOKENS,
        },
    }
}

interface GetCompletionParamsAndFetchImplParams {
    providerOptions: Readonly<ProviderOptions>
    lineNumberDependentCompletionParams: LineNumberDependentCompletionParamsByType
}

export function getCompletionParams(
    params: GetCompletionParamsAndFetchImplParams
): Omit<CodeCompletionsParams, 'messages'> {
    const { multilineParams } = params.lineNumberDependentCompletionParams

    const partialRequestParams = {
        ...multilineParams,
        temperature: 0.2,
        topK: 0,
    } satisfies Omit<CodeCompletionsParams, 'messages'>

    return partialRequestParams
}
