import type { UIToolOutput } from '@sourcegraph/cody-shared'
import { type FC, useCallback } from 'react'
import type { URI } from 'vscode-uri'
import type { VSCodeWrapper } from '../../../utils/VSCodeApi'
import { DiffCell } from './DiffCell'
import { FileCell } from './FileCell'
import { OutputStatusCell } from './OutputStatusCell'
import { SearchResultsCell } from './SearchResultsCell'
import { TerminalOutputCell } from './TerminalOutputCell'

export interface ToolStatusProps {
    status: string
    query?: string
    title: string
    output?: UIToolOutput
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

    if (output?.file) {
        return <FileCell result={output.file} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.search?.items?.length) {
        return <SearchResultsCell result={output?.search} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.diff) {
        return <DiffCell result={output.diff} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.terminal?.length) {
        return <TerminalOutputCell result={output?.terminal} />
    }

    return <OutputStatusCell title={title} result={result} status={currentStatus} query={query} />
}
