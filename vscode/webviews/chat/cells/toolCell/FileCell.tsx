import type { UIFileView } from '@sourcegraph/cody-shared'
import { FileCode } from 'lucide-react'
import type { FC } from 'react'
import type { URI } from 'vscode-uri'
import { Button } from '../../../components/shadcn/ui/button'
import { BaseCell } from './BaseCell'

interface FileCellProps {
    result: UIFileView
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
    const renderHeaderContent = () => (
        <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
            <Button
                variant="outline"
                className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden"
                onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    onFileLinkClicked(result.uri)
                }}
            >
                <span className="tw-font-mono">{result.fileName}</span>
            </Button>
        </div>
    )

    const renderBodyContent = () => (
        <div className="tw-overflow-x-auto tw-bg-zinc-950 tw-p-0">
            <pre className="tw-font-mono tw-text-xs tw-leading-relaxed">
                <table className="tw-w-full tw-border-collapse">
                    <tbody>
                        {result.content?.split('\n').map((line, index) => (
                            <tr key={`${index}-${line.substring(0, 10)}`}>
                                <td className="tw-select-none tw-border-r tw-border-r-zinc-700 tw-px-2 tw-text-right tw-text-zinc-500 tw-w-12">
                                    {index + 1}
                                </td>
                                <td className="tw-px-4 tw-py-0.5 tw-text-zinc-200 tw-whitespace-pre">
                                    <div className="tw-flex tw-items-center">{line}</div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </pre>
        </div>
    )

    return (
        <BaseCell
            icon={FileCode}
            headerContent={renderHeaderContent()}
            bodyContent={renderBodyContent()}
            className={className}
            defaultOpen={defaultOpen}
        />
    )
}
