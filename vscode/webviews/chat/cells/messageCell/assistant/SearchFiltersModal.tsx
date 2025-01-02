import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../../../components/shadcn/ui/button'
import { SearchFilters, type SearchFiltersProps } from './SearchFilters'

interface SearchFiltersModalProps extends SearchFiltersProps {
    close: () => void
}
export const SearchFiltersModal = ({
    selectedFilters,
    filters,
    onSelectedFiltersUpdate,
    close,
}: SearchFiltersModalProps) => {
    const [currentSelectedFilters, setCurrentSelectedFilters] = useState(selectedFilters)

    useEffect(() => setCurrentSelectedFilters(selectedFilters), [selectedFilters])

    const onApply = useCallback(() => {
        onSelectedFiltersUpdate(currentSelectedFilters)
        close()
    }, [onSelectedFiltersUpdate, currentSelectedFilters, close])

    return (
        <div className="tw-flex tw-flex-col tw-gap-8">
            <div className="tw-flex tw-items-center tw-justify-between ">
                <div className="tw-font-bold">Filter results</div>
                <div className="tw-flex tw-gap-4">
                    <Button variant="outline" onClick={close}>
                        Close
                    </Button>
                    <Button onClick={onApply}>Apply</Button>
                </div>
            </div>
            <SearchFilters
                filters={filters}
                selectedFilters={currentSelectedFilters}
                onSelectedFiltersUpdate={setCurrentSelectedFilters}
            />
            <div className="tw-flex tw-text-muted-foreground tw-items-center tw-justify-between">
                <div />
                <div className="tw-flex tw-gap-4">
                    <Button variant="outline" onClick={close}>
                        Close
                    </Button>
                    <Button onClick={onApply}>Apply</Button>
                </div>
            </div>
        </div>
    )
}
