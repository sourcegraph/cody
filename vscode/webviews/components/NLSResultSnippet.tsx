import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import { type FC, useCallback } from 'react'

import type { NLSSearchResult } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import type { Observable } from 'observable-fns'
import { useTelemetryRecorder } from '../utils/telemetry'
import { useConfig } from '../utils/useConfig'
import {
    type FetchFileParameters,
    FileMatchSearchResult,
    type ISelectableForContext,
} from './codeSnippet/CodeSnippet'

interface NLSResultSnippetProps extends ISelectableForContext {
    result: NLSSearchResult
    className?: string
}

export const NLSResultSnippet: FC<NLSResultSnippetProps> = ({
    result,
    className,
    selectedForContext,
    onSelectForContext,
}) => {
    const highlights = useExtensionAPI().highlights
    const {
        config: { serverEndpoint },
    } = useConfig()

    const fetchHighlights = useCallback<(parameters: FetchFileParameters) => Observable<string[][]>>(
        parameters => highlights(parameters),
        [highlights]
    )

    const telemetryRecorder = useTelemetryRecorder()
    const logSelection = useCallback(() => {
        if (result.__typename === 'FileMatch') {
            telemetryRecorder.recordEvent('onebox.searchResult', 'clicked', {
                privateMetadata: { filename: result.file.path },
                billingMetadata: { product: 'cody', category: 'core' },
            })
        }
    }, [telemetryRecorder, result])

    if (result.__typename === 'FileMatch') {
        return (
            <FileMatchSearchResult
                serverEndpoint={serverEndpoint}
                result={result}
                showAllMatches={false}
                defaultExpanded={false}
                fetchHighlightedFileLineRanges={fetchHighlights}
                className={className}
                onSelect={logSelection}
                selectedForContext={selectedForContext}
                onSelectForContext={onSelectForContext}
            />
        )
    }

    return null
}
