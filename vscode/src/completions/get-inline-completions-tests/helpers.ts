import dedent from 'dedent'
import { isEqual } from 'lodash'
import { expect } from 'vitest'

import {
    type CodeCompletionsClient,
    type CompletionParameters,
    type CompletionResponse,
    type CompletionResponseGenerator,
    CompletionStopReason,
    type Configuration,
    testFileUri,
} from '@sourcegraph/cody-shared'

import { emptyMockFeatureFlagProvider } from '../../testutils/mocks'
import type { SupportedLanguage } from '../../tree-sitter/grammars'
import { updateParseTreeCache } from '../../tree-sitter/parse-tree-cache'
import { getParser } from '../../tree-sitter/parser'
import { completionProviderConfig } from '../completion-provider-config'
import { ContextMixer } from '../context/context-mixer'
import { DefaultContextStrategyFactory } from '../context/context-strategy'
import { getCompletionIntent } from '../doc-context-getters'
import { getCurrentDocContext } from '../get-current-doc-context'
import {
    type InlineCompletionsParams,
    type InlineCompletionsResult,
    TriggerKind,
    getInlineCompletions as _getInlineCompletions,
} from '../get-inline-completions'
import {
    MULTI_LINE_STOP_SEQUENCES,
    SINGLE_LINE_STOP_SEQUENCES,
    createProviderConfig,
} from '../providers/anthropic'
import { pressEnterAndGetIndentString } from '../providers/hot-streak'
import type { ProviderOptions } from '../providers/provider'
import { RequestManager } from '../request-manager'
import { documentAndPosition } from '../test-helpers'
import { sleep } from '../utils'

// The dedent package seems to replace `\t` with `\\t` so in order to insert a tab character, we
// have to use interpolation. We abbreviate this to `T` because ${T} is exactly 4 characters,
// mimicking the default indentation of four spaces
export const T = '\t'

const URI_FIXTURE = testFileUri('test.ts')

type Params = Partial<Omit<InlineCompletionsParams, 'document' | 'position' | 'docContext'>> & {
    languageId?: string
    takeSuggestWidgetSelectionIntoAccount?: boolean
    onNetworkRequest?: (params: CompletionParameters) => void
    completionResponseGenerator?: (
        params: CompletionParameters
    ) => CompletionResponseGenerator | Generator<CompletionResponse>
    providerOptions?: Partial<ProviderOptions>
    configuration?: Partial<Configuration>
}

interface ParamsResult extends InlineCompletionsParams {
    /**
     * A promise that's resolved once `completionResponseGenerator` is done.
     * Used to wait for all the completion response chunks to be processed by the
     * request manager in autocomplete tests.
     */
    completionResponseGeneratorPromise: Promise<unknown>
    configuration?: Partial<Configuration>
}

/**
 * A test helper to create the parameters for {@link getInlineCompletions}.
 *
 * The code example must include a block character (█) to denote the current cursor position.
 */
export function params(
    code: string,
    responses: CompletionResponse[] | 'never-resolve',
    params: Params = {}
): ParamsResult {
    const {
        languageId = 'typescript',
        onNetworkRequest,
        completionResponseGenerator,
        triggerKind = TriggerKind.Automatic,
        selectedCompletionInfo,
        takeSuggestWidgetSelectionIntoAccount,
        isDotComUser = false,
        providerOptions,
        ...restParams
    } = params

    let requestCounter = 0
    let resolveCompletionResponseGenerator: (value?: unknown) => void
    const completionResponseGeneratorPromise = new Promise(resolve => {
        resolveCompletionResponseGenerator = resolve
    })

    const client: Pick<CodeCompletionsClient, 'complete'> = {
        async *complete(completeParams) {
            onNetworkRequest?.(completeParams)

            if (completionResponseGenerator) {
                for await (const response of completionResponseGenerator(completeParams)) {
                    yield { ...response, stopReason: CompletionStopReason.StreamingChunk }
                }

                // Signal to tests that all streaming chunks are processed.
                resolveCompletionResponseGenerator?.()
            }

            if (responses === 'never-resolve') {
                return new Promise(() => {})
            }

            return responses[requestCounter++] || { completion: '', stopReason: 'unknown' }
        },
    }

    const providerConfig = createProviderConfig({
        client,
        providerOptions,
    })

    const { document, position } = documentAndPosition(code, languageId, URI_FIXTURE.toString())

    const parser = getParser(document.languageId as SupportedLanguage)
    if (parser) {
        updateParseTreeCache(document, parser)
    }

    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
        dynamicMultilineCompletions: false,
        context: takeSuggestWidgetSelectionIntoAccount
            ? {
                  triggerKind: 0,
                  selectedCompletionInfo,
              }
            : undefined,
    })

    if (docContext === null) {
        throw new Error()
    }

    return {
        document,
        position,
        docContext,
        triggerKind,
        selectedCompletionInfo,
        providerConfig,
        requestManager: new RequestManager(),
        contextMixer: new ContextMixer(new DefaultContextStrategyFactory('none')),
        smartThrottleService: null,
        completionIntent: getCompletionIntent({
            document,
            position,
            prefix: docContext.prefix,
        }),
        isDotComUser,
        ...restParams,

        // Test-specific helpers
        completionResponseGeneratorPromise,
    }
}

interface ParamsWithInlinedCompletion extends Params {
    delayBetweenChunks?: number
}

/**
 * A test helper to create the parameters for {@link getInlineCompletions} with a completion
 * that's inlined in the code. Examples:
 *
 * 1. Params with prefix and suffix only and no completion response.
 *
 * function myFunction() {
 *   █
 * }
 *
 * E.g. { prefix: "function myFunction() {\n  ", suffix: "\n}" }
 *
 * 2. Params with prefix, suffix and the full completion response received with no intermediate chunks.
 *
 * function myFunction() {
 *   █const result = {
 *     value: 1,
 *     debug: true
 *   }
 *   return result█
 * }
 *
 * 3. Params with prefix, suffix and three completion chunks.
 *
 * function myFunction() {
 *   █const result = {
 *     value: 1,█
 *     debug: true
 *   }█
 *   return result█
 * }
 */
function paramsWithInlinedCompletion(
    code: string,
    { delayBetweenChunks, ...completionParams }: ParamsWithInlinedCompletion = {}
): ParamsResult {
    const chunks = dedent(code).split('█')

    if (chunks.length < 2) {
        throw new Error(
            'Code example must include a block character (█) to denote the current cursor position.'
        )
    }

    // For cases where no network request needed because a completion is cached already
    if (chunks.length === 2) {
        const [prefix, suffix] = chunks
        return params([prefix, suffix].join('█'), [], completionParams)
    }

    // The full completion is received right away with no intermediate chunks
    if (chunks.length === 3) {
        const [prefix, completion, suffix] = chunks
        return params([prefix, suffix].join('█'), [{ completion, stopReason: '' }], completionParams)
    }

    const [prefix, ...completionChunks] = chunks
    const suffix = completionChunks.pop()!
    const completion = completionChunks.join('')

    // The completion is streamed and processed chunk by chunk
    return params([prefix, suffix].join('█'), [{ completion, stopReason: '' }], {
        async *completionResponseGenerator() {
            let lastResponse = ''

            for (const completionChunk of completionChunks) {
                lastResponse += completionChunk
                yield {
                    completion: lastResponse,
                    stopReason: CompletionStopReason.StreamingChunk,
                }

                if (delayBetweenChunks) {
                    await sleep(delayBetweenChunks)
                }
            }
        },
        ...completionParams,
    })
}

interface GetInlineCompletionResult extends Omit<ParamsResult & InlineCompletionsResult, 'logId'> {
    acceptFirstCompletionAndPressEnter(): Promise<GetInlineCompletionResult>
}

/**
 * A wrapper around `getInlineCompletions` helper with a few differences optimized for the
 * most popular test cases with the aim to reduce the boilerplate code:
 *
 * 1. Uses `paramsWithInlinedCompletion` internally to create arguments for `getInlineCompletions`
 * which allows the consumer to define prefix, suffix and completion chunks in one template literal.
 * 2. Throws an error is the returned result is `null`. We can still use a lower level.
 * 3. Returns `params` a part of the result too, allowing to use its values in tests.
 */
export async function getInlineCompletionsWithInlinedChunks(
    code: string,
    completionParams: ParamsWithInlinedCompletion = {}
): Promise<GetInlineCompletionResult> {
    const params = paramsWithInlinedCompletion(code, completionParams)
    const result = await getInlineCompletions(params)

    if (!result) {
        throw new Error('This test helpers should always return a result')
    }

    const acceptFirstCompletionAndPressEnter = () => {
        const [{ insertText }] = result.items

        const newLineString = pressEnterAndGetIndentString(
            insertText,
            params.docContext.currentLinePrefix,
            params.document
        )

        const codeWithCompletionAndCursor =
            params.docContext.prefix + insertText + newLineString + '█' + params.docContext.suffix

        // Workaround for the internal `dedent` call to save the useful indentation.
        const codeWithExtraIndent = codeWithCompletionAndCursor
            .split('\n')
            .map(line => '  ' + line)
            .join('\n')

        return getInlineCompletionsWithInlinedChunks(codeWithExtraIndent, {
            ...completionParams,
            requestManager: params.requestManager,
        })
    }

    return { ...params, ...result, acceptFirstCompletionAndPressEnter }
}

/**
 * Wraps the `getInlineCompletions` function to omit `logId` so that test expected values can omit
 * it and be stable.
 */
export async function getInlineCompletions(
    params: ParamsResult
): Promise<Omit<InlineCompletionsResult, 'logId'> | null> {
    const { configuration = {} } = params
    await initCompletionProviderConfig(configuration)

    const result = await _getInlineCompletions(params)

    if (result) {
        const { logId: _discard, ...rest } = result

        return {
            ...rest,
            items: result.items.map(({ stopReason: discard, ...item }) => item),
        }
    }

    completionProviderConfig.setConfig({} as Configuration)
    return result
}

/** Test helper for when you just want to assert the completion strings. */
export async function getInlineCompletionsInsertText(params: ParamsResult): Promise<string[]> {
    const result = await getInlineCompletions(params)
    return result?.items.map(c => c.insertText) ?? []
}

export type V = Awaited<ReturnType<typeof getInlineCompletions>>

export function initCompletionProviderConfig(config: Partial<Configuration>) {
    return completionProviderConfig.init(config as Configuration, emptyMockFeatureFlagProvider)
}

expect.extend({
    /**
     * Checks if `CompletionParameters[]` contains one item with single-line stop sequences.
     */
    toBeSingleLine(requests: CompletionParameters[], _) {
        const { isNot } = this

        return {
            pass:
                requests.length === 1 && isEqual(requests[0]?.stopSequences, SINGLE_LINE_STOP_SEQUENCES),
            message: () => `Completion requests are${isNot ? ' not' : ''} single-line`,
            actual: requests.map(r => ({ stopSequences: r.stopSequences })),
            expected: [{ stopSequences: SINGLE_LINE_STOP_SEQUENCES }],
        }
    },
    /**
     * Checks if `CompletionParameters[]` contains three items with multi-line stop sequences.
     */
    toBeMultiLine(requests: CompletionParameters[], _) {
        const { isNot } = this

        return {
            pass: isEqual(requests[0]?.stopSequences, MULTI_LINE_STOP_SEQUENCES),
            message: () => `Completion requests are${isNot ? ' not' : ''} multi-line`,
            actual: requests.map(r => ({ stopSequences: r.stopSequences })),
            expected: [
                {
                    stopSequences: MULTI_LINE_STOP_SEQUENCES,
                },
            ],
        }
    },
})
