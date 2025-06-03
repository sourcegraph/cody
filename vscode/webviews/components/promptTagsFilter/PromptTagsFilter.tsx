import { ChevronDown, Tag } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '../shadcn/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '../shadcn/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '../shadcn/ui/tooltip'
import { usePromptTagsQuery } from './usePromptTagsQuery'

interface PromptTagsFilterProps {
    selectedTagId: string | null
    onTagChange: (tagId: string | null) => void
    className?: string
}

export const PromptTagsFilter: FC<PromptTagsFilterProps> = ({
    selectedTagId,
    onTagChange,
    className,
}) => {
    const { value: tags } = usePromptTagsQuery()
    const [isOpen, setIsOpen] = useState(false)

    // Get selected tag name for display
    const selectedTagName = selectedTagId ? tags?.find(t => t.id === selectedTagId)?.name : null

    return (
        <div className={`tw-px-2 tw-py-2 tw-border-b tw-border-border ${className || ''}`}>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild onClick={() => setIsOpen(!isOpen)}>
                    <Button
                        variant="outline"
                        className="tw-inline-flex tw-justify-between tw-items-center tw-w-full"
                    >
                        <div className="tw-flex tw-items-center tw-min-w-0 tw-mr-2">
                            <Tag
                                size={14}
                                className="tw-mr-2 tw-text-muted-foreground tw-flex-shrink-0"
                            />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="tw-truncate tw-inline-block tw-max-w-[95px]">
                                        {selectedTagName || 'All tags'}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    {selectedTagName || 'All tags'}
                                </TooltipContent>
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
                                        onTagChange(null)
                                        setIsOpen(false)
                                    }}
                                >
                                    <div className="tw-flex tw-w-full tw-justify-between">
                                        <span>All Tags</span>
                                        {!selectedTagId && <span className="tw-ml-auto">✓</span>}
                                    </div>
                                </CommandItem>
                                {tags?.map(tag => (
                                    <CommandItem
                                        key={tag.id}
                                        value={tag.id}
                                        onSelect={() => {
                                            onTagChange(tag.id)
                                            setIsOpen(false)
                                        }}
                                    >
                                        <div className="tw-flex tw-w-full tw-justify-between">
                                            <span>{tag.name}</span>
                                            {selectedTagId === tag.id && (
                                                <span className="tw-ml-auto">✓</span>
                                            )}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    )
}
