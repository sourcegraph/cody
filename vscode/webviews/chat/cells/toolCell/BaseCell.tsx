import { UIToolStatus } from '@sourcegraph/cody-shared'
import { ChevronDown, ChevronRight, type LucideProps } from 'lucide-react'
import {
    type FC,
    type ForwardRefExoticComponent,
    type ReactNode,
    type RefAttributes,
    memo,
    useState,
} from 'react'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '../../../components/shadcn/ui/collapsible'
import { ScrollArea } from '../../../components/shadcn/ui/scroll-area'
import { cn } from '../../../components/shadcn/utils'

// Define standard theme variants if needed
type ThemeVariant = 'dark' | 'light'

export interface BaseCellProps {
    /** Content to display in the header section */
    headerContent: ReactNode
    /** Icon to display in the header (left side) */
    icon?: ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>
    /** Content to display in the collapsible body */
    bodyContent?: ReactNode
    /** Additional class names for the container */
    className?: string
    /** Whether the cell is in a loading state */
    isLoading?: boolean
    /** Whether the cell should be open by default */
    defaultOpen?: boolean
    /** Theme variant (affects background colors) */
    theme?: ThemeVariant
    status?: UIToolStatus
}

const BaseCellComponent: FC<BaseCellProps> = ({
    headerContent,
    icon: Icon,
    bodyContent,
    className,
    isLoading = false,
    defaultOpen = false,
    status = UIToolStatus.Done,
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    // Define standard background colors based on theme
    const headerBgClass = 'tw-bg-zinc-900 light:tw-bg-gray-100'
    const bodyBgClasses = ['tw-bg-zinc-950', 'light:tw-bg-gray-50']
    if (status === UIToolStatus.Error) {
        bodyBgClasses.push('tw-bg-red-500 light:tw-bg-red-500')
    }
    const bodyBgClass = bodyBgClasses.join(' ')

    return (
        <div className={cn('tw-rounded-md tw-border tw-border-border tw-w-full', className)}>
            <Collapsible open={isOpen} onOpenChange={setIsOpen} className="tw-w-full tw-dark">
                <CollapsibleTrigger
                    className={cn(
                        'tw-flex tw-w-full tw-items-center tw-justify-between tw-px-4 tw-py-2 tw-text-sm tw-text-zinc-100 light:tw-text-gray-800 hover:tw-bg-zinc-800',
                        headerBgClass,
                        isLoading && 'tw-cursor-wait'
                    )}
                    disabled={isLoading}
                >
                    <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                        {Icon && <Icon size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />}
                        {headerContent}
                    </div>
                    {/* Only show chevron icons when there's expandable content */}
                    {bodyContent &&
                        (isOpen ? (
                            <ChevronDown size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                        ) : (
                            <ChevronRight size={16} className="tw-flex-shrink-0 tw-text-zinc-400" />
                        ))}
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="tw-overflow-auto tw-bg-zinc-950 tw-p-0 tw-h-auto tw-max-h-[300px]">
                        <ScrollArea className="tw-flex-1 tw-p-2 tw-overflow-auto" data-scrollable>
                            <div className={cn('tw-p-0', bodyBgClass)}>{bodyContent}</div>
                        </ScrollArea>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
}

export const BaseCell = memo(BaseCellComponent)
