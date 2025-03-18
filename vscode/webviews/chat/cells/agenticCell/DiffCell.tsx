import type { FileDiff } from '@sourcegraph/cody-shared'
import { ChevronDown, ChevronRight, FileCode, Minus, Plus } from 'lucide-react'
import { type FC, useState } from 'react'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '../../../components/shadcn/ui/collapsible'
import { cn } from '../../../components/shadcn/utils'

interface CodeDiffCellProps {
    result: FileDiff
    className?: string
    defaultOpen?: boolean
}

export const CodeDiffCell: FC<CodeDiffCellProps> = ({ result, className, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    return (
        <div className={cn('tw-rounded-md tw-border tw-border-border tw-w-full', className)}>
            <Collapsible open={isOpen} onOpenChange={setIsOpen} className="tw-w-full tw-dark">
                <CollapsibleTrigger className="tw-flex tw-w-full tw-items-center tw-justify-between tw-bg-zinc-900 tw-px-4 tw-py-2 tw-text-sm tw-text-zinc-100 hover:tw-bg-zinc-800">
                    <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                        <FileCode size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                        <span className="tw-font-mono">{result.fileName}</span>
                        <div className="tw-ml-2 tw-flex tw-flex-shrink-0 tw-items-center tw-gap-2">
                            <span className="tw-flex tw-items-center tw-text-emerald-500">
                                <Plus size={14} className="tw-mr-0.5" /> {result.total.added}
                            </span>
                            <span className="tw-flex tw-items-center tw-text-rose-500">
                                <Minus size={14} className="tw-mr-0.5" /> {result.total.removed}
                            </span>
                        </div>
                    </div>
                    {isOpen ? (
                        <ChevronDown size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                    ) : (
                        <ChevronRight size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                    )}
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="tw-overflow-x-auto tw-bg-zinc-950 tw-p-0">
                        <pre className="tw-font-mono tw-text-xs tw-leading-relaxed">
                            <table className="tw-w-full tw-border-collapse">
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
                                                            <span className="tw-text-emerald-500">
                                                                +
                                                            </span>
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
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
}
