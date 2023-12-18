import { AutocompleteTimeouts } from '@sourcegraph/cody-shared/src/configuration'

import { CodeCompletionsParams } from '../client'

import {
    fetchAndProcessCompletions,
    FetchAndProcessCompletionsParams,
    fetchAndProcessDynamicMultilineCompletions,
} from './fetch-and-process-completions'
import { ProviderOptions } from './provider'

const MAX_RESPONSE_TOKENS = 256

type LineNumberDependentCompletionParams = Pick<
    CodeCompletionsParams,
    'maxTokensToSample' | 'stopSequences' | 'timeoutMs'
>

interface LineNumberDependentCompletionParamsByType {
    singlelineParams: LineNumberDependentCompletionParams
    multilineParams: LineNumberDependentCompletionParams
    dynamicMultilineParams: LineNumberDependentCompletionParams
}

interface Params {
    singlelineStopRequences: string[]
    multilineStopSequences: string[]
}

export function getLineNumberDependentCompletionParams(params: Params): LineNumberDependentCompletionParamsByType {
    const { singlelineStopRequences, multilineStopSequences } = params

    return {
        singlelineParams: {
            timeoutMs: 5_000,
            // To speed up sample generation in single-line case, we request a lower token limit
            // since we can't terminate on the first `\n`.
            maxTokensToSample: 30,
            stopSequences: singlelineStopRequences,
        },
        multilineParams: {
            timeoutMs: 15_000,
            maxTokensToSample: MAX_RESPONSE_TOKENS,
            stopSequences: multilineStopSequences,
        },
        dynamicMultilineParams: {
            timeoutMs: 15_000,
            maxTokensToSample: MAX_RESPONSE_TOKENS,
            // Do not stop after two consecutive new lines to get the full syntax node content. For example:
            //
            // function quickSort(array) {
            //   if (array.length <= 1) {
            //     return array
            //   }
            //
            //   // the implementation continues here after two new lines.
            // }
            stopSequences: undefined,
        },
    }
}

interface GetCompletionParamsAndFetchImplParams {
    providerOptions: Readonly<ProviderOptions>
    lineNumberDependentCompletionParams: LineNumberDependentCompletionParamsByType
    timeouts?: AutocompleteTimeouts | undefined
}

interface GetRequestParamsAndFetchImplResult {
    partialRequestParams: Omit<CodeCompletionsParams, 'messages'>
    fetchAndProcessCompletionsImpl: (params: FetchAndProcessCompletionsParams) => Promise<void>
}

export function getCompletionParamsAndFetchImpl(
    params: GetCompletionParamsAndFetchImplParams
): GetRequestParamsAndFetchImplResult {
    const {
        timeouts,
        providerOptions: { multiline: isMutiline, dynamicMultilineCompletions, hotStreak },
        lineNumberDependentCompletionParams: { singlelineParams, multilineParams, dynamicMultilineParams },
    } = params

    const useExtendedGeneration = isMutiline || dynamicMultilineCompletions || hotStreak

    const partialRequestParams: Omit<CodeCompletionsParams, 'messages'> = {
        ...(useExtendedGeneration ? multilineParams : singlelineParams),
        temperature: 0.2,
    }

    // Apply custom multiline timeouts if they are defined.
    if (timeouts?.multiline && useExtendedGeneration) {
        partialRequestParams.timeoutMs = timeouts.multiline
    }

    // Apply custom singleline timeouts if they are defined.
    if (timeouts?.singleline && !useExtendedGeneration) {
        partialRequestParams.timeoutMs = timeouts.singleline
    }

    let fetchAndProcessCompletionsImpl = fetchAndProcessCompletions
    if (dynamicMultilineCompletions) {
        // If the feature flag is enabled use params adjusted for the experiment.
        Object.assign(partialRequestParams, dynamicMultilineParams)

        // Use an alternative fetch completions implementation.
        fetchAndProcessCompletionsImpl = fetchAndProcessDynamicMultilineCompletions
    }

    return {
        partialRequestParams,
        fetchAndProcessCompletionsImpl,
    }
}
