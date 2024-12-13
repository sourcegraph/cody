import type {PromptTagsResult} from '@sourcegraph/cody-shared'
import {useExtensionAPI, useObservable, type UseObservableResult} from '@sourcegraph/prompt-editor'
import {useMemo} from 'react'

/**
 * React hook to query for prompts in the prompt library.
 */
export function usePromptTagsQuery(): UseObservableResult<PromptTagsResult> {
    const promptTags = useExtensionAPI().promptTags
    return useObservable(useMemo(() => promptTags({}), [promptTags]))
}
