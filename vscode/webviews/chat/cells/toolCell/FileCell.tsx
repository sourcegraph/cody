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
    const renderHeaderContent = () => (
        <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-flex-row">
            <Button
                variant="ghost"
                className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-p-0 tw-text-left tw-truncate tw-w-full hover:tw-bg-transparent"
                onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (result?.uri && result?.uri.scheme !== 'cody') onFileLinkClicked(result?.uri)
                }}
            >
                <span className="tw-font-mono">
                    {result.uri ? displayPath(result.uri) : result.title}
                </span>
            </Button>
        </div>
    )

    return (
        <BaseCell
            icon={isError ? FileX : FileCode}
            headerContent={renderHeaderContent()}
            bodyContent={undefined}
            className={className}
            defaultOpen={defaultOpen} // Always closed since there's no content to show
        />
    )
}
