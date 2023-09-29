import { isEqual } from 'lodash'
import { expect } from 'vitest'
import { URI } from 'vscode-uri'

import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { CodeCompletionsClient } from '../client'
import { getCurrentDocContext } from '../get-current-doc-context'
import {
    getInlineCompletions as _getInlineCompletions,
    InlineCompletionsParams,
    TriggerKind,
} from '../get-inline-completions'
import { createProviderConfig, MULTI_LINE_STOP_SEQUENCES, SINGLE_LINE_STOP_SEQUENCES } from '../providers/anthropic'
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
        triggerKind = TriggerKind.Automatic,
        selectedCompletionInfo,
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
        enableExtendedTriggers: providerConfig.enableExtendedMultilineTriggers,
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

expect.extend({
    /**
     * Checks if `CompletionParameters[]` contains one item with single-line stop sequences.
     */
    toBeSingleLine(requests: CompletionParameters[], _) {
        const { isNot } = this

        return {
            pass: requests.length === 1 && isEqual(requests[0]?.stopSequences, SINGLE_LINE_STOP_SEQUENCES),
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
            pass: requests.length === 3 && isEqual(requests[0]?.stopSequences, MULTI_LINE_STOP_SEQUENCES),
            message: () => `Completion requests are${isNot ? ' not' : ''} multi-line`,
            actual: requests.map(r => ({ stopSequences: r.stopSequences })),
            expected: Array.from({ length: 3 }).map(() => ({ stopSequences: MULTI_LINE_STOP_SEQUENCES })),
        }
    },
})
