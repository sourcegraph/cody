import classNames from 'classnames'

import type { NLSSearchDynamicFilter, NLSSearchDynamicFilterKind } from '@sourcegraph/cody-shared'
import { uniqBy } from 'lodash'
import { XIcon } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import styles from './SearchFilters.module.css'
export interface SearchFiltersProps {
    filters: NLSSearchDynamicFilter[]
    selectedFilters: NLSSearchDynamicFilter[]
    onSelectedFiltersUpdate: (selectedFilters: NLSSearchDynamicFilter[]) => void
}
export const SearchFilters = ({
    filters,
    selectedFilters,
    onSelectedFiltersUpdate,
}: SearchFiltersProps) => {
    const filterGroups = useMemo(
        () =>
            uniqBy([...filters, ...selectedFilters], ({ value, kind }) => `${value}-${kind}`).reduce(
                (groups, filter) => {
                    if (['repo', 'file', 'type', 'lang'].includes(filter.kind)) {
                        groups[filter.kind as NLSSearchDynamicFilterKind].push(filter)
                    }

                    return groups
                },
                { repo: [], file: [], type: [], lang: [] } as Record<
                    NLSSearchDynamicFilterKind,
                    NLSSearchDynamicFilter[]
                >
            ),
        [filters, selectedFilters]
    )

    const onFilterSelect = useCallback(
        (filter: NLSSearchDynamicFilter) => {
            onSelectedFiltersUpdate([...selectedFilters, filter])
        },
        [selectedFilters, onSelectedFiltersUpdate]
    )
    const onFilterDeselect = useCallback(
        (filter: NLSSearchDynamicFilter) => {
            onSelectedFiltersUpdate(
                selectedFilters.filter(selectedFilter => !isFilterEqual(selectedFilter, filter))
            )
        },
        [selectedFilters, onSelectedFiltersUpdate]
    )

    return (
        <div className="tw-flex tw-flex-col tw-gap-8">
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
        <div
            className={classNames(
                styles.filter,
                'tw-flex tw-justify-between tw-items-center tw-py-2 tw-px-4 tw-rounded-md tw-cursor-pointer hover:tw-bg-accent hover:tw-text-accent-foreground',
                {
                    [styles.selected]: selected,
                }
            )}
            onClick={onClickHandler}
            role="button"
            onKeyDown={onClickHandler}
        >
            <div>{filter.label}</div>
            <div>{selected && <XIcon className="tw-size-8" />}</div>
        </div>
    )
}

const isFilterEqual = (a: NLSSearchDynamicFilter, b: NLSSearchDynamicFilter) =>
    a.kind === b.kind && a.value === b.value
