import { Book, Building2, ChevronDown, UserRoundPlus } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { Button } from '../shadcn/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '../shadcn/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '../shadcn/ui/tooltip'

export interface Organization {
    id: string
    name: string
}

interface PromptOwnerFilterProps {
    value: string | null
    onFilterChange: (value: string | null) => void
    className?: string
    organizations?: Organization[]
    userId?: string
}

const FILTER_ICONS = {
    all: Book,
    user: UserRoundPlus,
    org: Building2,
}

export const PromptOwnerFilter: FC<PromptOwnerFilterProps> = ({
    value,
    onFilterChange,
    className,
    organizations = [],
    userId,
}) => {
    const [isOpen, setIsOpen] = useState(false)

    // Determine filter type and text to display
    const { filterType, filterText } = useMemo(() => {
        // If no filter value, it's "All Prompts"
        if (!value) {
            return { filterType: 'all' as const, filterText: 'All Prompts' }
        }

        // If filter value matches user ID, it's "Owned by You"
        if (userId && value === userId) {
            return { filterType: 'user' as const, filterText: 'Owned by You' }
        }

        // Otherwise, check if it's an organization
        const org = organizations.find(o => o.id === value)
        if (org) {
            return { filterType: 'org' as const, filterText: `Org: ${org.name}` }
        }

        // Default fallback (should rarely happen)
        return { filterType: 'all' as const, filterText: 'All Prompts' }
    }, [value, userId, organizations])

    const FilterIcon = FILTER_ICONS[filterType]

    return (
        <div className={`tw-px-2 tw-py-2 tw-border-b tw-border-border ${className || ''}`}>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild onClick={() => setIsOpen(!isOpen)}>
                    <Button
                        variant="outline"
                        className="tw-inline-flex tw-justify-between tw-items-center tw-w-full"
                    >
                        <div className="tw-flex tw-items-center tw-min-w-0 tw-mr-2">
                            <FilterIcon
                                size={14}
                                className="tw-mr-2 tw-text-muted-foreground tw-flex-shrink-0"
                            />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="tw-truncate tw-inline-block tw-max-w-[95px]">
                                        {filterText}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">{filterText}</TooltipContent>
                            </Tooltip>
                        </div>
                        <ChevronDown size={14} className="tw-text-muted-foreground tw-flex-shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="tw-w-[220px] !tw-p-0" side="bottom" align="start">
                    <Command className="tw-w-full">
                        <CommandList className="tw-max-h-[200px]">
                            <CommandGroup>
                                <CommandItem
                                    value="all"
                                    onSelect={() => {
                                        onFilterChange(null)
                                        setIsOpen(false)
                                    }}
                                >
                                    <div className="tw-flex tw-w-full tw-justify-between">
                                        <div className="tw-flex tw-items-center">
                                            <Book size={14} className="tw-mr-2" />
                                            <span>All Prompts</span>
                                        </div>
                                        {!value && <span className="tw-ml-auto">✓</span>}
                                    </div>
                                </CommandItem>
                                {userId && (
                                    <CommandItem
                                        value="user"
                                        onSelect={() => {
                                            onFilterChange(userId)
                                            setIsOpen(false)
                                        }}
                                    >
                                        <div className="tw-flex tw-w-full tw-justify-between">
                                            <div className="tw-flex tw-items-center">
                                                <UserRoundPlus size={14} className="tw-mr-2" />
                                                <span>Owned by You</span>
                                            </div>
                                            {value === userId && <span className="tw-ml-auto">✓</span>}
                                        </div>
                                    </CommandItem>
                                )}
                            </CommandGroup>

                            {organizations.length > 0 && (
                                <CommandGroup heading="By Organization">
                                    {organizations.map((org: Organization) => (
                                        <CommandItem
                                            key={org.id}
                                            value={`org-${org.id}`}
                                            onSelect={() => {
                                                onFilterChange(org.id)
                                                setIsOpen(false)
                                            }}
                                        >
                                            <div className="tw-flex tw-w-full tw-justify-between">
                                                <div className="tw-flex tw-items-center">
                                                    <Building2 size={14} className="tw-mr-2" />
                                                    <span>{org.name}</span>
                                                </div>
                                                {value === org.id && (
                                                    <span className="tw-ml-auto">✓</span>
                                                )}
                                            </div>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    )
}
