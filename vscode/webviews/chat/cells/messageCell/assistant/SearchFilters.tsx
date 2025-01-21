import classNames from 'classnames'

import type { NLSSearchDynamicFilter, NLSSearchDynamicFilterKind } from '@sourcegraph/cody-shared'
import { escapeRegExp, uniqBy } from 'lodash'
import { XIcon } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { TELEMETRY_SEARCH_FILTER } from '../../../../../src/telemetry/onebox'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../components/shadcn/ui/tooltip'
import { useTelemetryRecorder } from '../../../../utils/telemetry'
import { RepositorySelector } from './RepositorySelector'
import styles from './SearchFilters.module.css'
export interface SearchFiltersProps {
    filters: NLSSearchDynamicFilter[]
    selectedFilters: NLSSearchDynamicFilter[]
    onSelectedFiltersUpdate: (selectedFilters: NLSSearchDynamicFilter[]) => void
}

const TYPE_FILTERS = [
    {
        kind: 'type',
        label: 'Code',
        value: 'type:code',
        count: 1,
    },
    {
        kind: 'type',
        label: 'Text',
        value: 'type:text',
        count: 1,
    },
    {
        kind: 'type',
        label: 'Paths',
        value: 'type:path',
        count: 1,
    },
]

const supportedDynamicFilterKinds: string[] = [
    'repo',
    'file',
    'lang',
] satisfies Array<NLSSearchDynamicFilterKind>

export const SearchFilters = ({
    filters,
    selectedFilters,
    onSelectedFiltersUpdate,
}: SearchFiltersProps) => {
    const telemetryRecorder = useTelemetryRecorder()
    const filterGroups = useMemo(() => {

        // Use filters available from search response, if not display previous selection
        const availableFilters = filters.length > 0 ? [...filters] : [...selectedFilters]

        return uniqBy(availableFilters, ({ value, kind }) => `${value}-${kind}`).reduce<
            Record<NLSSearchDynamicFilterKind, NLSSearchDynamicFilter[]>
        >(
            (groups, filter) => {
                if (supportedDynamicFilterKinds.includes(filter.kind)) {
                    groups[filter.kind as NLSSearchDynamicFilterKind].push(filter)
                }
                return groups
            },
            { repo: [], file: [], type: [], lang: [] }
        )
    }, [filters, selectedFilters])
    const onFilterSelect = useCallback(
        (filter: NLSSearchDynamicFilter) => {
            telemetryRecorder.recordEvent('onebox.filter', 'clicked', {
                metadata: {
                    filterType: getTelemetryFilterType(filter),
                },
                privateMetadata: { value: filter.value },
                billingMetadata: { product: 'cody', category: 'billable' },
            })

            // If the filter is NOT a repo filter, we want to replace
            // any existing filters of the same kind with the new one.
            // For repo filters, we support multiple repo selection.
            const updatedFilters =
                filter.kind === 'repo'
                    ? selectedFilters
                    : selectedFilters.filter(selectedFilter => selectedFilter.kind !== filter.kind)

            onSelectedFiltersUpdate([...updatedFilters, filter])
        },
        [selectedFilters, onSelectedFiltersUpdate, telemetryRecorder]
    )
    const onFilterDeselect = useCallback(
        (filter: NLSSearchDynamicFilter) => {
            onSelectedFiltersUpdate(
                selectedFilters.filter(selectedFilter => !isFilterEqual(selectedFilter, filter))
            )
        },
        [selectedFilters, onSelectedFiltersUpdate]
    )

    const onRepoSelect = useCallback(
        (repo: { name: string; id: string }) => {
            onFilterSelect({
                kind: 'repo',
                value: `repo:^${escapeRegExp(repo.name)}$`,
                label: repo.name,
                count: 1,
            })
        },
        [onFilterSelect]
    )

    return (
        <div className="tw-flex tw-flex-col tw-gap-8">
            <div className="tw-flex tw-flex-col tw-gap-4">
                <div className="tw-font-bold tw-mb-4">Result type</div>
                {TYPE_FILTERS.map(filter => (
                    <SearchFilter
                        key={filter.value}
                        filter={filter}
                        onFilterSelect={onFilterSelect}
                        onFilterDeselect={onFilterDeselect}
                        selectedFilters={selectedFilters}
                    />
                ))}
            </div>
            {filterGroups.lang.length > 0 && (
                <div className="tw-flex tw-flex-col tw-gap-4">
                    <div className="tw-font-bold tw-mb-4">Language</div>
                    {filterGroups.lang.map(filter => (
                        <SearchFilter
                            key={filter.value}
                            filter={filter}
                            onFilterSelect={onFilterSelect}
                            onFilterDeselect={onFilterDeselect}
                            selectedFilters={selectedFilters}
                        />
                    ))}
                </div>
            )}
            {filterGroups.repo.length > 0 && (
                <div className="tw-flex tw-flex-col tw-gap-4">
                    <div className="tw-font-bold tw-mb-4">Repository</div>
                    <RepositorySelector onSelect={onRepoSelect} />
                    {filterGroups.repo.map(filter => (
                        <SearchFilter
                            key={filter.value}
                            filter={filter}
                            onFilterSelect={onFilterSelect}
                            onFilterDeselect={onFilterDeselect}
                            selectedFilters={selectedFilters}
                        />
                    ))}
                </div>
            )}
            {filterGroups.file.length > 0 && (
                <div className="tw-flex tw-flex-col tw-gap-4">
                    <div className="tw-font-bold tw-mb-4">File and path</div>
                    {filterGroups.file.map(filter => (
                        <SearchFilter
                            key={filter.value}
                            filter={filter}
                            onFilterSelect={onFilterSelect}
                            onFilterDeselect={onFilterDeselect}
                            selectedFilters={selectedFilters}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

interface SearchFilterProps {
    filter: NLSSearchDynamicFilter
    selectedFilters: NLSSearchDynamicFilter[]
    onFilterSelect: (filter: NLSSearchDynamicFilter) => void
    onFilterDeselect: (filter: NLSSearchDynamicFilter) => void
}

const SearchFilter = ({
    filter,
    selectedFilters,
    onFilterSelect,
    onFilterDeselect,
}: SearchFilterProps) => {
    const selected = useMemo(
        () => selectedFilters.some(selectedFilter => isFilterEqual(selectedFilter, filter)),
        [selectedFilters, filter]
    )
    const onClickHandler = useCallback(
        () => (selected ? onFilterDeselect(filter) : onFilterSelect(filter)),
        [filter, onFilterDeselect, onFilterSelect, selected]
    )

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className={classNames(
                        styles.filter,
                        'tw-flex tw-justify-between tw-items-center tw-gap-2 tw-py-2 tw-px-4 tw-rounded-md tw-cursor-pointer hover:tw-bg-accent hover:tw-text-accent-foreground',
                        {
                            [styles.selected]: selected,
                        }
                    )}
                    onClick={onClickHandler}
                    role="button"
                    onKeyDown={onClickHandler}
                >
                    <div className="tw-text-ellipsis tw-overflow-hidden tw-max-w-[calc(100% - 1rem)] tw-line-clamp-1">
                        {filter.label}
                    </div>
                    <div>{selected && <XIcon className="tw-size-8" />}</div>
                </div>
            </TooltipTrigger>
            <TooltipContent>{filter.label}</TooltipContent>
        </Tooltip>
    )
}

const isFilterEqual = (a: NLSSearchDynamicFilter, b: NLSSearchDynamicFilter) =>
    a.kind === b.kind && a.value === b.value

function getTelemetryFilterType(filter: NLSSearchDynamicFilter): number {
    switch (filter.kind) {
        case 'lang':
            return TELEMETRY_SEARCH_FILTER.LANGUAGE
        case 'type':
            return TELEMETRY_SEARCH_FILTER.TYPE
        case 'repo':
            return TELEMETRY_SEARCH_FILTER.REPO
        case 'file':
            return TELEMETRY_SEARCH_FILTER.FILE
        default:
            return TELEMETRY_SEARCH_FILTER.UNKNOWN
    }
}
