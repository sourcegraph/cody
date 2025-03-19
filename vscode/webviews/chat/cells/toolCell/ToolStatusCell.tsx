import type {
    UIFileDiff,
    UIFileView,
    UISearchResults,
    UITerminalToolOutput,
    UIToolOutput,
} from '@sourcegraph/cody-shared'
import { type FC, useCallback } from 'react'
import type { URI } from 'vscode-uri'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import type { VSCodeWrapper } from '../../../utils/VSCodeApi'
import { DiffCell } from './DiffCell'
import { FileCell } from './FileCell'
import { OutputStatusCell } from './OutputStatusCell'
import { SearchResultsCell } from './SearchResultsCell'
import { TerminalOutputCell } from './TerminalOutputCell'

export interface ToolStatusProps {
    title: string
    output?: UIToolOutput
    content?: string
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

    if (title && !output) {
        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-h-7">
                <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
            </div>
        )
    }

    if (output?.type === 'file-view') {
        return <FileCell result={output as UIFileView} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.type === 'search-result') {
        return (
            <SearchResultsCell
                result={output as UISearchResults}
                onFileLinkClicked={onFileLinkClicked}
            />
        )
    }

    if (output?.type === 'file-diff') {
        return <DiffCell result={output as UIFileDiff} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.type === 'terminal-output') {
        return <TerminalOutputCell result={output as UITerminalToolOutput} />
    }

    return <OutputStatusCell output={output as UIToolOutput} />
}
