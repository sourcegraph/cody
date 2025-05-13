import { Book, Building2, ChevronDown, Clock, UserRoundPlus } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { Button } from '../shadcn/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '../shadcn/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/ui/popover'

export interface Organization {
    id: string
    name: string
}

export interface PromptFilterValue {
    owner?: string | null
    recentlyUsedOnly?: boolean
}

interface PromptOwnerFilterProps {
    value: PromptFilterValue
    onFilterChange: (value: PromptFilterValue) => void
    className?: string
    organizations?: Organization[]
    userId?: string
}

const FILTER_ICONS = {
    all: Book,
    user: UserRoundPlus,
    org: Building2,
    recent: Clock,
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
        // Check for Recent Prompts filter
        if (value.recentlyUsedOnly) {
            return { filterType: 'recent' as const, filterText: 'Recent Prompts' }
        }

        // If no owner filter value, it's "All Prompts"
        if (!value.owner) {
            return { filterType: 'all' as const, filterText: 'All Prompts' }
        }

        // If filter value matches user ID, it's "Owned by You"
        if (userId && value.owner === userId) {
            return { filterType: 'user' as const, filterText: 'Owned by You' }
        }

        // Otherwise, check if it's an organization
        const org = organizations.find(o => o.id === value.owner)
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
                        className="tw-inline-flex tw-justify-between tw-items-center tw-w-auto"
                    >
                        <div className="tw-flex tw-items-center">
                            <FilterIcon size={14} className="tw-mr-2 tw-text-muted-foreground" />
                            <span>{filterText}</span>
                        </div>
                        <ChevronDown size={14} className="tw-ml-2 tw-text-muted-foreground" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="tw-w-[220px] !tw-p-0" side="bottom" align="start">
                    <Command className="tw-w-full">
                        <CommandList className="tw-max-h-[200px]">
                            <CommandGroup>
                                <CommandItem
                                    value="all"
                                    onSelect={() => {
                                        onFilterChange({ owner: null, recentlyUsedOnly: false })
                                        setIsOpen(false)
                                    }}
                                >
                                    <div className="tw-flex tw-w-full tw-justify-between">
                                        <div className="tw-flex tw-items-center">
                                            <Book size={14} className="tw-mr-2" />
                                            <span>All Prompts</span>
                                        </div>
                                        {!value.owner && !value.recentlyUsedOnly && (
                                            <span className="tw-ml-auto">✓</span>
                                        )}
                                    </div>
                                </CommandItem>
                                <CommandItem
                                    value="recent"
                                    onSelect={() => {
                                        onFilterChange({ owner: null, recentlyUsedOnly: true })
                                        setIsOpen(false)
                                    }}
                                >
                                    <div className="tw-flex tw-w-full tw-justify-between">
                                        <div className="tw-flex tw-items-center">
                                            <Clock size={14} className="tw-mr-2" />
                                            <span>Recent Prompts</span>
                                        </div>
                                        {value.recentlyUsedOnly && <span className="tw-ml-auto">✓</span>}
                                    </div>
                                </CommandItem>
                                {userId && (
                                    <CommandItem
                                        value="user"
                                        onSelect={() => {
                                            onFilterChange({ owner: userId, recentlyUsedOnly: false })
                                            setIsOpen(false)
                                        }}
                                    >
                                        <div className="tw-flex tw-w-full tw-justify-between">
                                            <div className="tw-flex tw-items-center">
                                                <UserRoundPlus size={14} className="tw-mr-2" />
                                                <span>Owned by You</span>
                                            </div>
                                            {value.owner === userId && !value.recentlyUsedOnly && (
                                                <span className="tw-ml-auto">✓</span>
                                            )}
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
                                                onFilterChange({
                                                    owner: org.id,
                                                    recentlyUsedOnly: false,
                                                })
                                                setIsOpen(false)
                                            }}
                                        >
                                            <div className="tw-flex tw-w-full tw-justify-between">
                                                <div className="tw-flex tw-items-center">
                                                    <Building2 size={14} className="tw-mr-2" />
                                                    <span>{org.name}</span>
                                                </div>
                                                {value.owner === org.id && !value.recentlyUsedOnly && (
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
