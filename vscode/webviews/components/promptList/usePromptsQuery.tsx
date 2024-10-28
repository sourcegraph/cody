import type { PromptsInput, PromptsResult } from '@sourcegraph/cody-shared'
import { type UseObservableResult, useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo } from 'react'

/**
 * React hook to query for prompts in the prompt library.
 */
export function usePromptsQuery(input: PromptsInput): UseObservableResult<PromptsResult> {
    const prompts = useExtensionAPI().prompts
    return useObservable(useMemo(() => prompts(input), [prompts, input]))
}
