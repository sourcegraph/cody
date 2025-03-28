import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { type FC, useCallback } from 'react'
import type { URI } from 'vscode-uri'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import { type VSCodeWrapper, getVSCodeAPI } from '../../../utils/VSCodeApi'
import { DiffCell } from './DiffCell'
import { FileCell } from './FileCell'
import { OutputStatusCell } from './OutputStatusCell'
import { SearchResultsCell } from './SearchResultsCell'
import { TerminalOutputCell } from './TerminalOutputCell'

export interface ToolStatusProps {
    title: string
    output?: ContextItemToolState
    className?: string
    startTime?: Date
    endTime?: Date
    vscodeAPI?: VSCodeWrapper
}

export const ToolStatusCell: FC<ToolStatusProps> = ({ title, output }) => {
    const onFileLinkClicked = useCallback((uri: URI) => {
        // Fixes an issue where the link is not getting sent to the extension host
        // when the api is not available on the first render
        getVSCodeAPI()?.postMessage({ command: 'openFileLink', uri })
    }, [])

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
                query={output.title || 'Search result'}
                results={output.searchResultItems}
                onFileLinkClicked={onFileLinkClicked}
            />
        )
    }

    if (output?.outputType === 'file-diff') {
        return <DiffCell item={output} onFileLinkClicked={onFileLinkClicked} />
    }

    if (output?.outputType === 'terminal-output') {
        return <TerminalOutputCell command={title} item={output} />
    }

    return <OutputStatusCell item={output} />
}
