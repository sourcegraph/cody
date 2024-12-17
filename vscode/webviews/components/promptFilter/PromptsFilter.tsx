import { Book, BookUp2, Box, ChevronDown, ExternalLink, Plus, Tag, UserRoundPlus } from 'lucide-react'
import { type FC, useState } from 'react'
import { useConfig } from '../../utils/useConfig'
import { Button } from '../shadcn/ui/button'
import { Command, CommandGroup, CommandItem, CommandLink, CommandList } from '../shadcn/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/ui/popover'
import { useCurrentUserId } from './useCurrentUserId'
import { usePromptTagsQuery } from './usePromptTagsQuery'

export interface PromptFilterProps {
    promptFilters: PromptsFilterArgs
    setPromptFilters: (promptFilters: PromptsFilterArgs) => void
}

export interface PromptsFilterArgs {
    owner?: string
    tags?: string[]
    promoted?: boolean
    core?: boolean
}

export const PromptsFilter: FC<PromptFilterProps> = props => {
    const { value: resultTags, error: errorTags } = usePromptTagsQuery()
    const [isPromptTagsOpen, setIsPromptTagsOpen] = useState(false)
    const [selectedFilter, setSelectedFilter] = useState<FilterContentArgs>({ value: 'all' })

    const {
        config: { serverEndpoint },
    } = useConfig()

    const { value: userId, error: userIdError } = useCurrentUserId()

    const selectPromptFilter = (param: PromptsFilterArgs, origin: FilterContentArgs) => {
        setIsPromptTagsOpen(false)
        setSelectedFilter(origin)
        props.setPromptFilters(param)
    }

    return (
        // we need the surrounding div to prevent the remaining content from jumping
        <div>
            <Popover open={isPromptTagsOpen} onOpenChange={setIsPromptTagsOpen}>
                <PopoverTrigger
                    asChild
                    onClick={() => setIsPromptTagsOpen(!isPromptTagsOpen)}
                    className="tw-ml-8 tw-mt-8"
                >
                    <Button
                        variant="secondary"
                        className={'tw-bg-popover tw-border tw-border-border tw-w-48 !tw-justify-start'}
                    >
                        <span className="tw-w-full tw-flex tw-items-center tw-justify-between">
                            <FilterContent
                                value={selectedFilter.value}
                                nameOverride={selectedFilter.nameOverride}
                            />
                            <ChevronDown size={16} />
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="tw-flex tw-flex-col tw-w-full !tw-p-0"
                    side="bottom"
                    align="center"
                >
                    <div className="tw-w-[225px]">
                        <Command
                            loop={true}
                            defaultValue={selectedFilter.value}
                            tabIndex={0}
                            className="focus:tw-outline-none"
                        >
                            <CommandList>
                                <CommandGroup>
                                    <CommandLink
                                        href={`${serverEndpoint}prompts/new`}
                                        target="_blank"
                                        className="tw-w-full tw-no-underline tw-text-inherit hover:!tw-bg-transparent"
                                        rel="noreferrer"
                                    >
                                        <Button variant="outline" className="tw-w-full">
                                            <Plus size={16} /> Create new Prompt
                                        </Button>
                                    </CommandLink>
                                </CommandGroup>
                                <CommandGroup className="tw-w-full">
                                    <CommandItem
                                        value="all"
                                        onSelect={() => selectPromptFilter({}, { value: 'all' })}
                                    >
                                        <FilterContent value="all" />
                                    </CommandItem>
                                    {!userIdError && typeof userId === 'string' && (
                                        <CommandItem
                                            value="you"
                                            onSelect={() =>
                                                selectPromptFilter({ owner: userId }, { value: 'you' })
                                            }
                                        >
                                            <FilterContent value="you" />
                                        </CommandItem>
                                    )}
                                </CommandGroup>
                                <CommandGroup className="tw-w-full">
                                    <CommandItem
                                        value="promoted"
                                        onSelect={() =>
                                            selectPromptFilter({ promoted: true }, { value: 'promoted' })
                                        }
                                    >
                                        <FilterContent value="promoted" />
                                    </CommandItem>
                                    <CommandItem
                                        value="core"
                                        onSelect={() =>
                                            selectPromptFilter({ core: true }, { value: 'core' })
                                        }
                                    >
                                        <FilterContent value="core" />
                                    </CommandItem>
                                </CommandGroup>
                                {!!resultTags?.length && !errorTags && (
                                    <CommandGroup heading="By tag" className="tw-w-full">
                                        <div className="tw-max-h-[200px] tw-overflow-y-auto">
                                            {resultTags.map(tag => (
                                                <CommandItem
                                                    key={tag.id}
                                                    value={`tag:${tag.id}`}
                                                    onSelect={() =>
                                                        selectPromptFilter(
                                                            { tags: [tag.id] },
                                                            {
                                                                value: `tag:${tag.id}`,
                                                                nameOverride: tag.name,
                                                            }
                                                        )
                                                    }
                                                >
                                                    <FilterContent
                                                        value={tag.id}
                                                        nameOverride={tag.name}
                                                    />
                                                </CommandItem>
                                            ))}
                                        </div>
                                    </CommandGroup>
                                )}
                                <CommandGroup className="tw-w-full">
                                    <CommandLink
                                        href={`${serverEndpoint}prompts`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="tw-flex"
                                    >
                                        <span className="tw-flex-grow">Explore Prompt Library</span>
                                        <ExternalLink size={16} />
                                    </CommandLink>
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}

type PromptsFilterValue = 'all' | 'you' | 'promoted' | 'core' | string

const iconForFilter: Record<PromptsFilterValue, { icon: typeof Tag; name: string }> = {
    all: {
        icon: Book,
        name: 'All Prompts',
    },
    you: {
        icon: UserRoundPlus,
        name: 'Owned by You',
    },
    promoted: {
        icon: BookUp2,
        name: 'Promoted',
    },
    core: {
        icon: Box,
        name: 'Core',
    },
}

type FilterContentArgs = { value: string; nameOverride?: string }

const FilterContent: FC<FilterContentArgs> = props => {
    const filter = iconForFilter[props.value]
    const Icon = filter?.icon ?? Tag

    return (
        <>
            <Icon size={16} className="tw-mr-3" /> {props.nameOverride ?? filter?.name}
        </>
    )
}
