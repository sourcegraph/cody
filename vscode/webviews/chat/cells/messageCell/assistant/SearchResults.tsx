import type { ChatMessageWithSearch, NLSSearchDynamicFilter } from '@sourcegraph/cody-shared'
import { ArrowDown, ExternalLink, FilterIcon, Search } from 'lucide-react'
import { useState } from 'react'
import { NLSResultSnippet } from '../../../../components/NLSResultSnippet'
import { Button } from '../../../../components/shadcn/ui/button'
import { useConfig } from '../../../../utils/useConfig'
import { useExperimentalOneBoxDebug } from '../../../../utils/useExperimentalOneBox'
import { FeedbackButtons } from '../../../components/FeedbackButtons'
import { InfoMessage } from '../../../components/InfoMessage'
import { LoadingDots } from '../../../components/LoadingDots'
import { SearchFiltersModal } from './SearchFiltersModal'

interface SearchResultsProps {
    message: ChatMessageWithSearch
    showFeedbackButtons?: boolean
    feedbackButtonsOnSubmit?: (text: string) => void
    onSelectedFiltersUpdate: (filters: NLSSearchDynamicFilter[]) => void
}

const DEFAULT_RESULTS_LIMIT = 5
export const SearchResults = ({
    message,
    onSelectedFiltersUpdate,
    showFeedbackButtons,
    feedbackButtonsOnSubmit,
}: SearchResultsProps) => {
    const experimentalOneBoxDebug = useExperimentalOneBoxDebug()

    const [showAll, setShowAll] = useState(false)
    const [showFilters, setShowFilters] = useState(false)

    const totalResults = message.search.response?.results.results.length ?? 0

    const {
        config: { serverEndpoint },
    } = useConfig()

    if (showFilters) {
        return (
            <SearchFiltersModal
                filters={message.search.response?.results.dynamicFilters || []}
                selectedFilters={message.search.selectedFilters || []}
                onSelectedFiltersUpdate={onSelectedFiltersUpdate}
                close={() => setShowFilters(false)}
            />
        )
    }

    // This is to figure out if the current assistant response is in loading state.
    // `messageInProgress` is otherwise passed at the global level for the latest message.
    if (!message.text && !!message.search.query) {
        return <LoadingDots />
    }

    return (
        <>
            {!!message.search.response?.results.results.length && (
                <div className="tw-flex tw-items-center tw-gap-4 tw-justify-between">
                    <div className="tw-flex tw-gap-2 tw-items-center tw-font-semibold tw-text-muted-foreground">
                        <Search className="tw-size-8" />
                        Displaying{' '}
                        <span className="tw-text-muted-foreground">
                            {totalResults > DEFAULT_RESULTS_LIMIT && !showAll
                                ? `${DEFAULT_RESULTS_LIMIT} of ${totalResults}`
                                : totalResults}
                        </span>{' '}
                        code search results
                    </div>
                    <div>
                        <Button onClick={() => setShowFilters(true)} variant="outline">
                            <FilterIcon className="tw-size-8" />
                            Filters
                        </Button>
                    </div>
                </div>
            )}
            {experimentalOneBoxDebug && message.search.query && (
                <InfoMessage className="tw-mt-4">Query: {message.search.query}</InfoMessage>
            )}
            {experimentalOneBoxDebug && message.search.queryWithSelectedFilters && (
                <InfoMessage className="tw-mt-4">
                    Query with selected filters: {message.search.queryWithSelectedFilters}
                </InfoMessage>
            )}
            {!!message.search.response?.results.results.length && (
                <ul className="tw-list-none tw-flex tw-flex-col tw-gap-2 tw-pt-2">
                    {message.search.response.results.results.map((result, i) =>
                        showAll || i < DEFAULT_RESULTS_LIMIT ? (
                            <li
                                // biome-ignore lint/correctness/useJsxKeyInIterable:
                                // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                key={i}
                            >
                                <NLSResultSnippet result={result} />
                            </li>
                        ) : null
                    )}
                </ul>
            )}
            <div className="tw-flex tw-justify-between tw-gap-4 tw-my-4">
                <div className="tw-flex tw-items-center tw-gap-4">
                    {!showAll && totalResults > DEFAULT_RESULTS_LIMIT && (
                        <Button onClick={() => setShowAll(true)} variant="outline">
                            <ArrowDown className="tw-size-8" />
                            More results
                        </Button>
                    )}
                    {showFeedbackButtons && feedbackButtonsOnSubmit && (
                        <FeedbackButtons feedbackButtonsOnSubmit={feedbackButtonsOnSubmit} />
                    )}
                </div>
                <a
                    href={`${serverEndpoint}/search`}
                    target="_blank"
                    rel="noreferrer"
                    className="tw-text-foreground"
                >
                    <Button variant="outline">
                        Code search <ExternalLink className="tw-size-8" />
                    </Button>
                </a>
            </div>
        </>
    )
}
