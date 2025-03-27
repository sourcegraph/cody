import { UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { FC } from 'react'
import type { URI } from 'vscode-uri'
import { Skeleton } from '../../../components/shadcn/ui/skeleton'
import { type VSCodeWrapper, getVSCodeAPI } from '../../../utils/VSCodeApi'
import { UnifiedToolCell } from './UnifiedToolCell'

export interface ToolStatusProps {
    title: string
    output?: ContextItemToolState
    className?: string
    startTime?: Date
    endTime?: Date
    vscodeAPI?: VSCodeWrapper
}

/**
 * A simplified wrapper around UnifiedToolCell that handles common use cases
 */
export const SimplifiedToolCell: FC<ToolStatusProps> = ({ title, output, className }) => {
    if (!title || !output) {
        return (
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-h-7">
                <Skeleton className="tw-h-4 tw-w-40 tw-bg-zinc-800 tw-animate-pulse" />
            </div>
        )
    }

    const handleFileLinkClick = (uri: URI) => {
        getVSCodeAPI()?.postMessage({ command: 'openFileLink', uri })
    }

    return (
        <UnifiedToolCell
            item={output}
            title={title}
            className={className}
            onFileLinkClicked={handleFileLinkClick}
            defaultOpen={output.status === UIToolStatus.Error} // Auto-open on error
        />
    )
}
