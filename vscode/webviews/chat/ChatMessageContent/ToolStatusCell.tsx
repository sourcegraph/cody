import type { ExtendedToolOutput } from '@sourcegraph/cody-shared'
import type { FC } from 'react'
import { CodeDiffCell } from '../cells/agenticCell/DiffCell'
import { OutputStatusCell } from '../cells/agenticCell/OutputStatusCell'
import { SearchResultsCell } from '../cells/agenticCell/SearchResultsCell'
import { TerminalOutputCell } from '../cells/agenticCell/TerminalOutputCell'

export interface ToolStatusProps {
    status: string
    query?: string
    title: string
    output?: ExtendedToolOutput
    result?: string
    className?: string
    startTime?: Date
    endTime?: Date
}

type StatusType = 'success' | 'error' | 'info' | 'warning'

export const ToolStatusCell: FC<ToolStatusProps> = ({ status, title, output, query, result }) => {
    const currentStatus: StatusType =
        status === 'pending' ? 'info' : status === 'done' ? 'success' : 'error'

    if (output?.searchResult?.results?.length) {
        return <SearchResultsCell result={output?.searchResult} />
    }

    if (output?.diffResult) {
        return <CodeDiffCell result={output.diffResult} />
    }

    if (output?.bashResult?.length) {
        return <TerminalOutputCell result={output?.bashResult} />
    }

    return <OutputStatusCell title={title} result={result} status={currentStatus} query={query} />
}
