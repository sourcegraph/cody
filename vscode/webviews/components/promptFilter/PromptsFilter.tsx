import { Book, BookUp2, Box, ChevronDown, ExternalLink, Plus, Tag, UserRoundPlus } from 'lucide-react'
import { type FC, useState } from 'react'
import { useConfig } from '../../utils/useConfig'
import { Button } from '../shadcn/ui/button'
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

    const { value: userId, error } = useCurrentUserId()

    const selectPromptFilter = (param: PromptsFilterArgs, origin: FilterContentArgs) => {
        setIsPromptTagsOpen(false)
        setSelectedFilter(origin)
        props.setPromptFilters(param)
    }

    return (
        <Popover open={isPromptTagsOpen}>
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
            <PopoverContent className="tw-flex tw-flex-col tw-w-full" side="bottom" align="center">
                <div className="tw-w-[225px]">
                    <a
                        href={`${serverEndpoint}prompts/new`}
                        target="_blank"
                        className="tw-w-full"
                        rel="noreferrer"
                    >
                        <Button variant="outline" className="tw-w-full">
                            <Plus size={16} /> Create new Prompt
                        </Button>
                    </a>
                    <div className="tw-border-t tw-border-border tw-w-full tw-mt-4 tw-mb-4 tw-pt-4">
                        <PromptsFilterItem
                            onSelect={() => selectPromptFilter({}, { value: 'all' })}
                            value={'all'}
                        />
                        {typeof userId === 'string' && !error && (
                            <PromptsFilterItem
                                onSelect={() => selectPromptFilter({ owner: userId }, { value: 'you' })}
                                value={'you'}
                            />
                        )}
                    </div>
                    <div className="tw-border-t tw-border-border tw-w-full tw-mt-4 tw-mb-4  tw-pt-4">
                        <PromptsFilterItem
                            onSelect={() =>
                                selectPromptFilter({ promoted: true }, { value: 'promoted' })
                            }
                            value={'promoted'}
                        />
                        <PromptsFilterItem
                            onSelect={() => selectPromptFilter({ core: true }, { value: 'core' })}
                            value={'core'}
                        />
                    </div>
                    {!!resultTags?.length && !errorTags && (
                        <div className="tw-border-t tw-border-border tw-w-full tw-mt-4 tw-mb-4  tw-pt-4">
                            <div className="tw-text-muted-foreground tw-mt-4">By tag</div>
                            <ul className="tw-mt-4 tw-max-h-[200px] tw-overflow-y-auto">
                                {resultTags.map(tag => (
                                    <li key={tag.id} className="tw-flex">
                                        <PromptsFilterItem
                                            onSelect={() =>
                                                selectPromptFilter(
                                                    { tags: [tag.id] },
                                                    {
                                                        value: 'tag',
                                                        nameOverride: tag.name,
                                                    }
                                                )
                                            }
                                            value={tag.id}
                                            nameOverride={tag.name}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="tw-border-t tw-border-border tw-w-full tw-pt-4  tw-pt-4">
                        <div className="tw-flex">
                            <a
                                className="tw-flex-grow"
                                href={`${serverEndpoint}prompts`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Explore Prompt Library
                            </a>{' '}
                            <ExternalLink size={16} />
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

type PromptsFilterValue = 'all' | 'you' | 'promoted' | 'core' | string

interface PromptsFilterItemProps extends FilterContentArgs {
    onSelect: () => void
}

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

const PromptsFilterItem: FC<PromptsFilterItemProps> = props => {
    return (
        <div>
            <Button
                key={`prompts-filter-${props.value}`}
                value={props.value}
                onClick={props.onSelect}
                className={'tw-text-left'}
                variant={'ghost'}
            >
                <span className="tw-flex tw-pt-2 tw-pb-2">
                    <FilterContent value={props.value} nameOverride={props.nameOverride} />
                </span>
            </Button>
        </div>
    )
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
