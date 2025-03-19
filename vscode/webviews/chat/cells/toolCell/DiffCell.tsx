import { type UIFileDiff, displayPath } from '@sourcegraph/cody-shared'
import { FileDiffIcon, Minus, Plus } from 'lucide-react'
import { type FC, useMemo } from 'react'
import type { URI } from 'vscode-uri'
import { Button } from '../../../components/shadcn/ui/button'
import { cn } from '../../../components/shadcn/utils'
import { BaseCell } from './BaseCell'

interface DiffCellProps {
    result: UIFileDiff
    className?: string
    defaultOpen?: boolean
    onFileLinkClicked: (uri: URI) => void
}

export const DiffCell: FC<DiffCellProps> = ({
    result,
    className,
    onFileLinkClicked,
    defaultOpen = false,
}) => {
    const fileName = useMemo(() => displayPath(result.uri), [result.uri])

    const renderHeaderContent = () => (
        <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
            <Button
                variant="ghost"
                className="tw-text-left tw-truncate tw-flex tw-items-center tw-gap-2 tw-overflow-hidden tw-p-0"
                onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    onFileLinkClicked(result.uri)
                }}
            >
                <span className="tw-font-mono">{fileName}</span>
            </Button>
            <div className="tw-ml-2 tw-flex tw-flex-shrink-0 tw-items-center tw-gap-2">
                <span className="tw-flex tw-items-center tw-text-emerald-500">
                    <Plus size={14} className="tw-mr-0.5" /> {result.total.added}
                </span>
                <span className="tw-flex tw-items-center tw-text-rose-500">
                    <Minus size={14} className="tw-mr-0.5" /> {result.total.removed}
                </span>
            </div>
        </div>
    )

    const renderBodyContent = () => (
        <pre className="tw-font-mono tw-text-xs tw-leading-relaxed  tw-bg-zinc-950">
            <table className="tw-w-full tw-h-full tw-border-collapse">
                <tbody>
                    {result.changes.map((change, _index) => (
                        <tr
                            key={change.lineNumber}
                            className={cn(
                                'hover:tw-bg-zinc-800/50',
                                change.type === 'added' && 'tw-bg-emerald-950/30',
                                change.type === 'removed' && 'tw-bg-rose-950/30'
                            )}
                        >
                            <td className="tw-select-none tw-border-r tw-border-r-zinc-700 tw-px-2 tw-text-right tw-text-zinc-500 tw-w-12">
                                {change.lineNumber}
                            </td>
                            <td className="tw-px-4 tw-py-0.5 tw-text-zinc-200 tw-whitespace-pre">
                                <div className="tw-flex tw-items-center">
                                    <span className="tw-mr-2 tw-w-4 tw-text-center">
                                        {change.type === 'added' && (
                                            <span className="tw-text-emerald-500">+</span>
                                        )}
                                        {change.type === 'removed' && (
                                            <span className="tw-text-rose-500">-</span>
                                        )}
                                    </span>
                                    {change.content}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </pre>
    )

    return (
        <BaseCell
            icon={FileDiffIcon}
            headerContent={renderHeaderContent()}
            bodyContent={renderBodyContent()}
            className={className}
            defaultOpen={defaultOpen}
        />
    )
}
