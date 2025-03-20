import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { type FC, useCallback, useMemo } from 'react'
import type { URI } from 'vscode-uri'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import type { VSCodeWrapper } from '../../../utils/VSCodeApi'
import { DiffCell } from './DiffCell'
import { FileCell } from './FileCell'
import { OutputStatusCell } from './OutputStatusCell'
import { SearchResultsCell } from './SearchResultsCell'
import { TerminalOutputCell, convertToTerminalLines } from './TerminalOutputCell'

export interface ToolStatusProps {
    title: string
    output?: ContextItemToolState
    className?: string
    startTime?: Date
    endTime?: Date
    vscodeAPI?: VSCodeWrapper
}

export const ToolStatusCell: FC<ToolStatusProps> = ({ title, output, vscodeAPI }) => {
    const onFileLinkClicked = useCallback(
        (uri: URI) => {
            vscodeAPI?.postMessage({ command: 'openFileLink', uri })
        },
        [vscodeAPI]
    )

    if (!title || !output) {
        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-h-7">
                <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
            </div>
        )
    }

    if (output?.outputType === 'file-view') {
        return <FileCell result={output} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.outputType === 'search-result' && output.searchResultItems) {
        return (
            <SearchResultsCell
                query={output.title || ''}
                results={output.searchResultItems}
                onFileLinkClicked={onFileLinkClicked}
            />
        )
    }

    if (output?.outputType === 'file-diff') {
        return <DiffCell item={output} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.outputType === 'terminal-output') {
        const lines = useMemo(
            () => (output.content ? convertToTerminalLines(output.content) : []),
            [output.content]
        )

        return <TerminalOutputCell lines={lines} />
    }

    return <OutputStatusCell item={output} />
}
