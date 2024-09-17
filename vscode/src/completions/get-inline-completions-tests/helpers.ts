import dedent from 'dedent'
import { Observable } from 'observable-fns'
import { vi } from 'vitest'
import type { URI } from 'vscode-uri'

import {
    AUTH_STATUS_FIXTURE_AUTHED,
    AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
    type AuthenticatedAuthStatus,
    type AutocompleteProviderID,
    type CodeCompletionsClient,
    type CompletionParameters,
    type CompletionResponse,
    CompletionStopReason,
    featureFlagProvider,
    mockAuthStatus,
    mockResolvedConfig,
    testFileUri,
} from '@sourcegraph/cody-shared'
import type {
    CodeCompletionsParams,
    CompletionResponseWithMetaData,
} from '@sourcegraph/cody-shared/src/inferenceClient/misc'

import { DEFAULT_VSCODE_SETTINGS } from '../../testutils/mocks'
import type { SupportedLanguage } from '../../tree-sitter/grammars'
import { updateParseTreeCache } from '../../tree-sitter/parse-tree-cache'
import { getParser } from '../../tree-sitter/parser'
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
import { AutocompleteStageRecorder, type CompletionLogID } from '../logger'
import { createProvider as createAnthropicProvider } from '../providers/anthropic'
import { createProvider as createFireworksProvider } from '../providers/fireworks'
import { pressEnterAndGetIndentString } from '../providers/shared/hot-streak'
import type { GenerateCompletionsOptions } from '../providers/shared/provider'
import { RequestManager } from '../request-manager'
import { documentAndPosition } from '../test-helpers'
import { sleep } from '../utils'

// The dedent package seems to replace `\t` with `\\t` so in order to insert a tab character, we
// have to use interpolation. We abbreviate this to `T` because ${T} is exactly 4 characters,
// mimicking the default indentation of four spaces
export const T = '\t'

export type Params = Partial<Omit<InlineCompletionsParams, 'document' | 'position' | 'docContext'>> & {
    languageId?: string
    takeSuggestWidgetSelectionIntoAccount?: boolean
    onNetworkRequest?: (params: CodeCompletionsParams, abortController: AbortController) => void
    completionResponseGenerator?: (
        params: CompletionParameters
    ) => Generator<CompletionResponse> | AsyncGenerator<CompletionResponse>
    configuration?: Parameters<typeof mockResolvedConfig>[0]
    authStatus?: AuthenticatedAuthStatus
    documentUri?: URI
}

export interface ParamsResult extends Omit<InlineCompletionsParams, 'configuration' | 'authStatus'> {
    /**
     * A promise that's resolved once `completionResponseGenerator` is done.
     * Used to wait for all the completion response chunks to be processed by the
     * request manager in autocomplete tests.
     */
    completionResponseGeneratorPromise: Promise<unknown>
    configuration?: Parameters<typeof mockResolvedConfig>[0]
    authStatus?: AuthenticatedAuthStatus
}

/**
 * A test helper to create the parameters for {@link getInlineCompletions}.
 *
 * The code example must include a block character (█) to denote the current cursor position.
 */
export function params(
    code: string,
    responses: CompletionResponse[] | CompletionResponseWithMetaData[] | 'never-resolve',
    {
        languageId = 'typescript',
        onNetworkRequest,
        completionResponseGenerator,
        triggerKind = TriggerKind.Automatic,
        selectedCompletionInfo,
        takeSuggestWidgetSelectionIntoAccount,
        configuration: config,
        documentUri = testFileUri('test.ts'),
        authStatus = AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
        ...restParams
    }: Params = {}
): ParamsResult {
    mockAuthStatus(authStatus)

    let requestCounter = 0
    let resolveCompletionResponseGenerator: (value?: unknown) => void
    const completionResponseGeneratorPromise = new Promise(resolve => {
        resolveCompletionResponseGenerator = resolve
    })

    const client: CodeCompletionsClient = {
        async *complete(completeParams, abortController) {
            onNetworkRequest?.(completeParams, abortController)

            if (completionResponseGenerator) {
                for await (const response of completionResponseGenerator(completeParams)) {
                    yield {
                        completionResponse: {
                            ...response,
                            stopReason: CompletionStopReason.StreamingChunk,
                        },
                    }
                }

                // Signal to tests that all streaming chunks are processed.
                resolveCompletionResponseGenerator?.()
            }

            if (responses === 'never-resolve') {
                return new Promise(() => {})
            }

            const response = responses[requestCounter++]

            if (response && 'completionResponse' in response) {
                return response
            }

            return {
                completionResponse: (response as CompletionResponse) || {
                    completion: '',
                    stopReason: 'unknown',
                },
            }
        },
        logger: undefined,
    }

    // TODO: add support for `createProvider` from `vscode/src/completions/providers/shared/create-provider.ts`
    const createProvider =
        config?.configuration?.autocompleteAdvancedProvider === 'fireworks' &&
        config?.configuration?.autocompleteAdvancedModel
            ? createFireworksProvider
            : createAnthropicProvider

    const provider = createProvider({
        legacyModel: config?.configuration?.autocompleteAdvancedModel!,
        provider:
            (config?.configuration?.autocompleteAdvancedModel as AutocompleteProviderID) || 'anthropic',
        source: 'local-editor-settings',
        authStatus,
    })

    provider.client = client

    const { document, position } = documentAndPosition(code, languageId, documentUri.toString())

    const parser = getParser(document.languageId as SupportedLanguage)
    if (parser) {
        updateParseTreeCache(document, parser)
    }

    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: provider.contextSizeHints.prefixChars,
        maxSuffixLength: provider.contextSizeHints.suffixChars,
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
        authStatus,
        configuration: config ?? { configuration: {}, auth: {} },
        document,
        position,
        docContext,
        triggerKind,
        selectedCompletionInfo,
        provider,
        firstCompletionTimeout:
            config?.configuration?.autocompleteFirstCompletionTimeout ??
            DEFAULT_VSCODE_SETTINGS.autocompleteFirstCompletionTimeout,
        requestManager: new RequestManager(),
        contextMixer: new ContextMixer(new DefaultContextStrategyFactory(Observable.of('none'))),
        smartThrottleService: null,
        completionIntent: getCompletionIntent({
            document,
            position,
            prefix: docContext.prefix,
        }),
        stageRecorder: new AutocompleteStageRecorder({ isPreloadRequest: false }),
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
export function paramsWithInlinedCompletion(
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
    pressEnter(): Promise<GetInlineCompletionResult>
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

    const pressEnter = (insertText = '') => {
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

    const acceptFirstCompletionAndPressEnter = () => {
        return pressEnter(result.items[0].insertText)
    }

    return { ...params, ...result, acceptFirstCompletionAndPressEnter, pressEnter }
}

/**
 * Helper to access `getInlineCompletions` in tests.
 * Unlike `getInlineCompletions`, this returns the full response, including `logId`.
 */
export async function getInlineCompletionsFullResponse(
    params: ParamsResult
): Promise<InlineCompletionsResult | null> {
    initCompletionProviderConfig(params)
    return await _getInlineCompletions(params)
}

/**
 * Wraps the `getInlineCompletions` function to omit `logId` so that test expected values can omit
 * it and be stable.
 */
export async function getInlineCompletions(
    params: ParamsResult
): Promise<Omit<InlineCompletionsResult, 'logId'> | null> {
    const result = await getInlineCompletionsFullResponse(params)
    if (!result) {
        return null
    }

    const { logId: _discard, ...rest } = result

    return {
        ...rest,
        items: result.items.map(({ stopReason: discard, ...item }) => item),
    }
}

/** Test helper for when you just want to assert the completion strings. */
export async function getInlineCompletionsInsertText(params: ParamsResult): Promise<string[]> {
    const result = await getInlineCompletions(params)
    return result?.items.map(c => c.insertText) ?? []
}

export type V = Awaited<ReturnType<typeof getInlineCompletions>>

export function initCompletionProviderConfig({
    configuration,
    authStatus,
}: Partial<Pick<ParamsResult, 'configuration' | 'authStatus'>>): void {
    vi.spyOn(featureFlagProvider, 'evaluateFeatureFlag').mockResolvedValue(false)
    vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    mockAuthStatus(authStatus ?? AUTH_STATUS_FIXTURE_AUTHED)
    mockResolvedConfig({
        configuration: { ...configuration?.configuration },
        auth: { serverEndpoint: 'https://example.com', ...configuration?.auth },
        clientState: { ...configuration?.clientState },
    })
}

export function getMockedGenerateCompletionsOptions(): GenerateCompletionsOptions {
    const { position, document, docContext, triggerKind } = params('const value = █', [])
    return {
        position,
        document,
        docContext,
        multiline: false,
        triggerKind,
        snippets: [],
        numberOfCompletionsToGenerate: 1,
        firstCompletionTimeout: 5_000,
        completionLogId: 'test-log-id' as CompletionLogID,
    }
}
