import type { ContextItem } from '@sourcegraph/cody-shared'
import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import { type FC, useCallback, useMemo } from 'react'

import type { Observable } from 'observable-fns'
import { useConfig } from '../utils/useConfig'
import { type FetchFileParameters, FileContentSearchResult } from './codeSnippet/CodeSnippet'
import type { ContentMatch } from './codeSnippet/types'

interface FileSnippetProps {
    item: ContextItem
    className?: string
}

export const FileSnippet: FC<FileSnippetProps> = props => {
    const { item, className } = props

    const highlights = useExtensionAPI().highlights
    const {
        config: { serverEndpoint },
    } = useConfig()

    const fetchHighlights = useCallback<(parameters: FetchFileParameters) => Observable<string[][]>>(
        parameters => highlights(parameters),
        [highlights]
    )

    const contentMatch = useMemo<ContentMatch>(() => {
        const startLine = item.range?.start.line ?? 0
        return {
            type: 'content',
            // Hack, file item always has file path as title
            // TODO: Refactor content file item in order to have file path explicitly in object
            path: item.title ?? '',
            repository: item.repoName ?? '',
            commit: item.revision,
            chunkMatches: [
                {
                    content: item.content ?? '',
                    contentStart: { line: Math.max(startLine - 1, 0), column: 0 },
                    ranges: [],
                },
            ],
        }
    }, [item])

    // Supports only file context (openctx items are not supported
    // but possible could be presented by snippets as well)
    if (item.type !== 'file') {
        return null
    }

    return (
        <FileContentSearchResult
            serverEndpoint={serverEndpoint}
            result={contentMatch}
            showAllMatches={true}
            defaultExpanded={false}
            fetchHighlightedFileLineRanges={fetchHighlights}
            className={className}
            onSelect={() => {}}
        />
    )
}
