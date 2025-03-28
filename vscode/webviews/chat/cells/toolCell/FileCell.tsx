import { UIToolStatus, displayPath } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { FileCode, FileX } from 'lucide-react'
import type { FC } from 'react'
import type { URI } from 'vscode-uri'
import { Button } from '../../../components/shadcn/ui/button'
import { BaseCell } from './BaseCell'

interface FileCellProps {
    result: ContextItemToolState
    className?: string
    defaultOpen?: boolean
    onFileLinkClicked: (uri: URI) => void
}

export const FileCell: FC<FileCellProps> = ({
    result,
    className,
    onFileLinkClicked,
    defaultOpen = false,
}) => {
    const isError = result?.status === UIToolStatus.Error
    const title = result.uri ? displayPath(result.uri) : result.title
    const renderHeaderContent = () => (
        <Button
            variant="ghost"
            className={
                'tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-p-0 tw-w-full tw-text-left tw-truncate tw-z-10 hover:tw-bg-transparent tw-font-mono' +
                isError
                    ? ' tw-border-red-700'
                    : ''
            }
            title={title}
            onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                if (result?.uri) onFileLinkClicked(result.uri)
            }}
        >
            {title}
        </Button>
    )

    return (
        <BaseCell
            icon={isError ? FileX : FileCode}
            headerContent={renderHeaderContent()}
            className={className}
            defaultOpen={defaultOpen} // Always closed since there's no content to show
            status={result?.status}
        />
    )
}
