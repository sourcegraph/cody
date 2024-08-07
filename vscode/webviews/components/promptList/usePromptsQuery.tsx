import type { PromptsResult } from '@sourcegraph/cody-shared'
import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import {
    type UseAsyncGeneratorResult,
    useAsyncGenerator,
} from '@sourcegraph/prompt-editor/src/useAsyncGenerator'
import { useCallback } from 'react'

/**
 * React hook to query for prompts in the prompt library.
 */
export function usePromptsQuery(query: string): UseAsyncGeneratorResult<PromptsResult> {
    const prompts = useExtensionAPI().prompts
    return useAsyncGenerator(
        useCallback((signal: AbortSignal) => prompts(query, signal), [prompts, query])
    )
}
