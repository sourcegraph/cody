import { URI } from 'vscode-uri'

import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { vsCodeMocks } from '../../testutils/mocks'
import { CodeCompletionsClient } from '../client'
import { getCurrentDocContext } from '../get-current-doc-context'
import { getInlineCompletions as _getInlineCompletions, InlineCompletionsParams } from '../getInlineCompletions'
import { createProviderConfig } from '../providers/anthropic'
import { RequestManager } from '../request-manager'
import { documentAndPosition } from '../test-helpers'
import { SupportedLanguage } from '../tree-sitter/grammars'
import { updateParseTreeCache } from '../tree-sitter/parse-tree-cache'
import { getParser } from '../tree-sitter/parser'

// The dedent package seems to replace `\t` with `\\t` so in order to insert a tab character, we
// have to use interpolation. We abbreviate this to `T` because ${T} is exactly 4 characters,
// mimicking the default indentation of four spaces
export const T = '\t'

const URI_FIXTURE = URI.parse('file:///test.ts')

type Params = Partial<Omit<InlineCompletionsParams, 'document' | 'position' | 'docContext'>> & {
    languageId?: string
    onNetworkRequest?: (
        params: CompletionParameters,
        onPartialResponse?: (incompleteResponse: CompletionResponse) => void
    ) => void | Promise<void>
}

/**
 * A test helper to create the parameters for {@link getInlineCompletions}.
 *
 * The code example must include a block character (█) to denote the current cursor position.
 */
export function params(
    code: string,
    responses: CompletionResponse[] | 'never-resolve',
    {
        languageId = 'typescript',
        onNetworkRequest,
        context = {
            triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
            selectedCompletionInfo: undefined,
        },
        ...params
    }: Params = {}
): InlineCompletionsParams {
    let requestCounter = 0
    const client: Pick<CodeCompletionsClient, 'complete'> = {
        async complete(params, onPartialResponse): Promise<CompletionResponse> {
            await onNetworkRequest?.(params, onPartialResponse)
            return responses === 'never-resolve'
                ? new Promise(() => {})
                : Promise.resolve(responses?.[requestCounter++] || { completion: '', stopReason: 'unknown' })
        },
    }
    const providerConfig = createProviderConfig({
        client,
        contextWindowTokens: 2048,
    })

    const { document, position } = documentAndPosition(code, languageId, URI_FIXTURE.toString())

    const parser = getParser(document.languageId as SupportedLanguage)
    if (parser) {
        updateParseTreeCache(document, parser)
    }

    const docContext = getCurrentDocContext(
        document,
        position,
        1000,
        1000,
        providerConfig.enableExtendedMultilineTriggers
    )
    if (docContext === null) {
        throw new Error()
    }

    return {
        document,
        position,
        context,
        docContext,
        promptChars: 1000,
        isEmbeddingsContextEnabled: true,
        providerConfig,
        responsePercentage: 0.4,
        prefixPercentage: 0.3,
        suffixPercentage: 0.3,
        toWorkspaceRelativePath: () => 'test.ts',
        requestManager: new RequestManager(),
        ...params,
    }
}

/**
 * Wraps the `getInlineCompletions` function to omit `logId` so that test expected values can omit
 * it and be stable.
 */
export async function getInlineCompletions(
    ...args: Parameters<typeof _getInlineCompletions>
): Promise<Omit<NonNullable<Awaited<ReturnType<typeof _getInlineCompletions>>>, 'logId'> | null> {
    const result = await _getInlineCompletions(...args)
    if (result) {
        const { logId: _discard, ...rest } = result
        return rest
    }
    return result
}

/** Test helper for when you just want to assert the completion strings. */
export async function getInlineCompletionsInsertText(
    ...args: Parameters<typeof _getInlineCompletions>
): Promise<string[]> {
    const result = await getInlineCompletions(...args)
    return result?.items.map(c => c.insertText) ?? []
}

export type V = Awaited<ReturnType<typeof getInlineCompletions>>
