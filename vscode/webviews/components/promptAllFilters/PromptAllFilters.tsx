import { Book, Building2, ChevronDown, UserRoundPlus } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '../shadcn/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '../shadcn/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/ui/popover'

export type FilterType = 'all' | 'user' | 'org'

export interface FilterValue {
    type: FilterType
    orgId?: string
}

export interface Organization {
    id: string
    name: string
}

interface PromptAllFiltersProps {
    filterValue: FilterValue
    onFilterChange: (filter: FilterValue) => void
    className?: string
    organizations?: Organization[]
}

export const PromptAllFilters: FC<PromptAllFiltersProps> = ({
    filterValue,
    onFilterChange,
    className,
    organizations = [],
}) => {
    const [isOpen, setIsOpen] = useState(false)

    const getFilterIcon = () => {
        switch (filterValue.type) {
            case 'user':
                return <UserRoundPlus size={14} className="tw-mr-2 tw-text-muted-foreground" />
            case 'org':
                return <Building2 size={14} className="tw-mr-2 tw-text-muted-foreground" />
            default:
                return <Book size={14} className="tw-mr-2 tw-text-muted-foreground" />
        }
    }

    const getFilterText = () => {
        switch (filterValue.type) {
            case 'user':
                return 'Owned by You'
            case 'org':
                if (filterValue.orgId && organizations.length) {
                    const org = organizations.find((o: Organization) => o.id === filterValue.orgId)
                    return org ? `Org: ${org.name}` : 'By Organization'
                }
                return 'By Organization'
            default:
                return 'All Prompts'
        }
    }

    return (
        <div className={`tw-px-2 tw-py-2 tw-border-b tw-border-border ${className || ''}`}>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild onClick={() => setIsOpen(!isOpen)}>
                    <Button
                        variant="outline"
                        className="tw-inline-flex tw-justify-between tw-items-center tw-w-auto"
                    >
                        <div className="tw-flex tw-items-center">
                            {getFilterIcon()}
                            <span>{getFilterText()}</span>
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
                                        onFilterChange({ type: 'all' })
                                        setIsOpen(false)
                                    }}
                                >
                                    <div className="tw-flex tw-w-full tw-justify-between">
                                        <div className="tw-flex tw-items-center">
                                            <Book size={14} className="tw-mr-2" />
                                            <span>All Prompts</span>
                                        </div>
                                        {filterValue.type === 'all' && (
                                            <span className="tw-ml-auto">✓</span>
                                        )}
                                    </div>
                                </CommandItem>
                                <CommandItem
                                    value="user"
                                    onSelect={() => {
                                        onFilterChange({ type: 'user' })
                                        setIsOpen(false)
                                    }}
                                >
                                    <div className="tw-flex tw-w-full tw-justify-between">
                                        <div className="tw-flex tw-items-center">
                                            <UserRoundPlus size={14} className="tw-mr-2" />
                                            <span>Owned by You</span>
                                        </div>
                                        {filterValue.type === 'user' && (
                                            <span className="tw-ml-auto">✓</span>
                                        )}
                                    </div>
                                </CommandItem>
                            </CommandGroup>

                            {organizations.length > 0 && (
                                <CommandGroup heading="By Organization">
                                    {organizations.map((org: Organization) => (
                                        <CommandItem
                                            key={org.id}
                                            value={`org-${org.id}`}
                                            onSelect={() => {
                                                onFilterChange({ type: 'org', orgId: org.id })
                                                setIsOpen(false)
                                            }}
                                        >
                                            <div className="tw-flex tw-w-full tw-justify-between">
                                                <div className="tw-flex tw-items-center">
                                                    <Building2 size={14} className="tw-mr-2" />
                                                    <span>{org.name}</span>
                                                </div>
                                                {filterValue.type === 'org' &&
                                                    filterValue.orgId === org.id && (
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
