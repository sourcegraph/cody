import type { ExtendedToolOutput } from '@sourcegraph/cody-shared'
import { type FC, useCallback } from 'react'
import type { URI } from 'vscode-uri'
import type { VSCodeWrapper } from '../../utils/VSCodeApi'
import { DiffCell } from '../cells/toolCell/DiffCell'
import { FileCell } from '../cells/toolCell/FileCell'
import { OutputStatusCell } from '../cells/toolCell/OutputStatusCell'
import { SearchResultsCell } from '../cells/toolCell/SearchResultsCell'
import { TerminalOutputCell } from '../cells/toolCell/TerminalOutputCell'

export interface ToolStatusProps {
    status: string
    query?: string
    title: string
    output?: ExtendedToolOutput
    result?: string
    className?: string
    startTime?: Date
    endTime?: Date
    vscodeAPI?: VSCodeWrapper
}

type StatusType = 'success' | 'error' | 'info' | 'warning'

export const ToolStatusCell: FC<ToolStatusProps> = ({
    status,
    title,
    output,
    query,
    result,
    vscodeAPI,
}) => {
    const onFileLinkClicked = useCallback(
        (uri: URI) => {
            vscodeAPI?.postMessage({ command: 'openFileLink', uri })
        },
        [vscodeAPI]
    )

    const currentStatus: StatusType =
        status === 'pending' ? 'info' : status === 'done' ? 'success' : 'error'

    if (output?.fileResult) {
        return <FileCell result={output.fileResult} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.searchResult?.results?.length) {
        return <SearchResultsCell result={output?.searchResult} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.diffResult) {
        return <DiffCell result={output.diffResult} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.bashResult?.length) {
        return <TerminalOutputCell result={output?.bashResult} />
    }

    return <OutputStatusCell title={title} result={result} status={currentStatus} query={query} />
}
