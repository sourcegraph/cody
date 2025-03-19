import type { UIToolOutput } from '@sourcegraph/cody-shared'
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

type StatusType = 'success' | 'error' | 'info' | 'warning'

export const ToolStatusCell: FC<ToolStatusProps> = ({ title, output, vscodeAPI }) => {
    const onFileLinkClicked = useCallback(
        (uri: URI) => {
            vscodeAPI?.postMessage({ command: 'openFileLink', uri })
        },
        [vscodeAPI]
    )

    const currentStatus = getStatusType(output?.status)

    if (title && !output) {
        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-h-7">
                <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
            </div>
        )
    }

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

    return <OutputStatusCell title={title} query={output?.query} status={currentStatus} />
}

function getStatusType(status: string | undefined): StatusType {
    switch (status) {
        case 'error':
            return 'error'
        case 'done':
            return 'success'
        default:
            return 'info'
    }
}
