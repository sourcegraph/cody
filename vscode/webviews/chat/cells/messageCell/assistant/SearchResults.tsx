import {
    CODE_SEARCH_PROVIDER_URI,
    type ChatMessageWithSearch,
    type NLSSearchDynamicFilter,
    type NLSSearchResult,
    isDefined,
} from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import {
    ArrowDown,
    ExternalLink,
    FilterIcon,
    FilterX,
    OctagonX,
    PanelLeftClose,
    Search,
} from 'lucide-react'
import { useCallback, useContext, useLayoutEffect, useMemo, useReducer, useState } from 'react'
import { createContextItem } from '../../../../../src/context/openctx/codeSearch'
import { LastEditorContext } from '../../../../chat/context'
import { NLSResultSnippet } from '../../../../components/NLSResultSnippet'
import { Button } from '../../../../components/shadcn/ui/button'
import { Label } from '../../../../components/shadcn/ui/label'
import { useConfig } from '../../../../utils/useConfig'
import { useExperimentalOneBoxDebug } from '../../../../utils/useExperimentalOneBox'
import { FeedbackButtons } from '../../../components/FeedbackButtons'
import { InfoMessage } from '../../../components/InfoMessage'
import { LoadingDots } from '../../../components/LoadingDots'
import { SearchFilters } from './SearchFilters'
import { SearchFiltersModal } from './SearchFiltersModal'

import styles from './SearchResults.module.css'

interface SearchResultsProps {
    message: ChatMessageWithSearch
    showFeedbackButtons?: boolean
    feedbackButtonsOnSubmit?: (text: string) => void
    onSelectedFiltersUpdate: (filters: NLSSearchDynamicFilter[]) => void
    /**
     * Whether or not search results can be selected as context for the next interaction.
     */
    enableContextSelection: boolean
}

const DEFAULT_RESULTS_LIMIT = 10
export const SearchResults = ({
    message,
    onSelectedFiltersUpdate,
    showFeedbackButtons,
    feedbackButtonsOnSubmit,
    enableContextSelection,
}: SearchResultsProps) => {
    const experimentalOneBoxDebug = useExperimentalOneBoxDebug()
    const lastEditorRef = useContext(LastEditorContext)
    const [selectedFollowUpResults, updateSelectedFollowUpResults] = useReducer(
        selectedResultsReducer,
        new Set<NLSSearchResult>()
    )

    const [showAll, setShowAll] = useState(false)
    const [showFiltersModal, setShowFiltersModal] = useState(false)
    const [showFiltersSidebar, setShowFiltersSidebar] = useState(true)

    const totalResults = useMemo(
        () =>
            message.search.response?.results.results.filter(
                result => result.__typename === 'FileMatch' && result.chunkMatches?.length
            ) || [],
        [message.search.response]
    )

    const initialResults = useMemo(() => totalResults?.slice(0, DEFAULT_RESULTS_LIMIT), [totalResults])

    const resultsToShow =
        initialResults?.length === totalResults?.length || showAll ? totalResults : initialResults

    const {
        config: { serverEndpoint },
    } = useConfig()

    // Select all results by default when the results are rendered the first time
    useLayoutEffect(() => {
        updateSelectedFollowUpResults({
            type: 'init',
            results: initialResults ?? [],
        })
    }, [initialResults])

    // Update the context chip in the last editor (when enabled) when the selected search results change.
    useLayoutEffect(() => {
        if (!enableContextSelection) {
            return
        }

        if (selectedFollowUpResults.size > 0) {
            const contextItem = createContextItem(
                Array.from(selectedFollowUpResults)
                    .map(result => {
                        switch (result.__typename) {
                            case 'FileMatch':
                                return {
                                    type: 'file' as const,
                                    repoName: result.repository.name,
                                    filePath: result.file.path,
                                    rev: result.file.commit.oid,
                                }
                            default:
                                return null
                        }
                    })
                    .filter(isDefined)
            )
            lastEditorRef.current?.upsertMentions([contextItem], 'before', ' ', false)
        } else {
            lastEditorRef.current?.filterMentions(
                mention => mention.type !== 'openctx' || mention.providerUri !== CODE_SEARCH_PROVIDER_URI
            )
        }
    }, [enableContextSelection, selectedFollowUpResults, lastEditorRef])

    const handleSelectForContext = useCallback((selected: boolean, result: NLSSearchResult) => {
        updateSelectedFollowUpResults({
            type: selected ? 'add' : 'remove',
            results: [result],
        })
    }, [])

    if (showFiltersModal) {
        return (
            <SearchFiltersModal
                filters={message.search.response?.results.dynamicFilters || []}
                selectedFilters={message.search.selectedFilters || []}
                onSelectedFiltersUpdate={onSelectedFiltersUpdate}
                close={() => setShowFiltersModal(false)}
            />
        )
    }

    return (
        <div
            className={classNames(
                styles.container,
                'tw-flex tw-gap-8 tw-items-start tw-justify-between'
            )}
        >
            {showFiltersSidebar && !!message.search.response?.results.dynamicFilters?.length && (
                <div
                    className={classNames(
                        'tw-min-w-[250px] tw-w-[250px] tw-relative tw-mt-2 tw-p-4 tw-rounded-md',
                        styles.filtersSidebar
                    )}
                >
                    <div
                        className="tw-absolute tw-top-2 tw-right-2"
                        onClick={() => setShowFiltersSidebar(false)}
                        onKeyDown={() => setShowFiltersSidebar(false)}
                        role="button"
                    >
                        <PanelLeftClose className="tw-size-8" />
                    </div>
                    <SearchFilters
                        filters={message.search.response?.results.dynamicFilters || []}
                        selectedFilters={message.search.selectedFilters || []}
                        onSelectedFiltersUpdate={onSelectedFiltersUpdate}
                    />
                </div>
            )}
            {!message.text && !!message.search.query ? (
                <div className="tw-flex-1">
                    <LoadingDots />
                </div>
            ) : (
                <div
                    className={classNames('tw-flex-1', styles.resultsContainer, {
                        [styles.filtersSidebarHidden]:
                            !showFiltersSidebar ||
                            !message.search.response?.results.dynamicFilters?.length,
                    })}
                >
                    {!!resultsToShow && (
                        <div
                            className={classNames(
                                'tw-flex tw-items-center tw-gap-4 tw-justify-between',
                                styles.searchResultsHeader
                            )}
                        >
                            <div className="tw-flex tw-gap-2 tw-items-center tw-font-semibold tw-text-muted-foreground">
                                <Search className="tw-size-8 tw-flex-shrink-0" />
                                Displaying {resultsToShow.length} code search results
                            </div>
                            <div className="tw-flex tw-gap-4">
                                {!!message.search.response?.results.dynamicFilters?.length && (
                                    <>
                                        <Button
                                            onClick={() => {
                                                setShowFiltersModal(true)
                                                setShowFiltersSidebar(true)
                                            }}
                                            variant="outline"
                                            className={styles.filtersModalTrigger}
                                        >
                                            {message.search.selectedFilters?.length ? (
                                                <FilterX className="tw-size-8" />
                                            ) : (
                                                <FilterIcon className="tw-size-8" />
                                            )}
                                            <span className={styles.searchResultsHeaderLabel}>
                                                Filters
                                            </span>
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                setShowFiltersSidebar(open => !open)
                                            }}
                                            variant="outline"
                                            className={styles.filtersSidebarToggle}
                                        >
                                            {message.search.selectedFilters?.length ? (
                                                <FilterX className="tw-size-8" />
                                            ) : (
                                                <FilterIcon className="tw-size-8" />
                                            )}
                                            <span className={styles.searchResultsHeaderLabel}>
                                                Filters
                                            </span>
                                        </Button>
                                    </>
                                )}
                                <div className="tw-flex tw-items-center tw-gap-4">
                                    <Label
                                        htmlFor="search-results.select-all"
                                        className={styles.searchResultsHeaderLabel}
                                    >
                                        Add to context:
                                    </Label>
                                    <input
                                        type="checkbox"
                                        id="search-results.select-all"
                                        checked={selectedFollowUpResults.size === resultsToShow.length}
                                        disabled={!enableContextSelection}
                                        onChange={event => {
                                            if (event.target.checked) {
                                                updateSelectedFollowUpResults({
                                                    type: 'add',
                                                    results: resultsToShow,
                                                })
                                            } else {
                                                updateSelectedFollowUpResults({
                                                    type: 'init',
                                                    results: [],
                                                })
                                            }
                                        }}
                                    />
                                </div>
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
                    {resultsToShow.length ? (
                        <ul className="tw-list-none tw-flex tw-flex-col tw-gap-2 tw-pt-2">
                            {resultsToShow.map((result, i) => (
                                <li
                                    // biome-ignore lint/correctness/useJsxKeyInIterable:
                                    // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                    key={i}
                                >
                                    <NLSResultSnippet
                                        result={result}
                                        selectedForContext={selectedFollowUpResults.has(result)}
                                        onSelectForContext={
                                            enableContextSelection ? handleSelectForContext : undefined
                                        }
                                    />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="tw-flex tw-flex-col tw-gap-4 tw-justify-center tw-items-center tw-my-20 tw-text-muted-foreground">
                            <OctagonX className="tw-size-8" />
                            <p>No search results found</p>
                        </div>
                    )}
                    <div className="tw-flex tw-justify-between tw-gap-4 tw-my-4">
                        <div className="tw-flex tw-items-center tw-gap-4">
                            {!showAll &&
                                resultsToShow &&
                                totalResults &&
                                resultsToShow !== totalResults && (
                                    <Button
                                        onClick={() => {
                                            setShowAll(true)
                                            updateSelectedFollowUpResults({
                                                type: 'add',
                                                results: totalResults.slice(resultsToShow.length),
                                            })
                                        }}
                                        variant="outline"
                                    >
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
                </div>
            )}
        </div>
    )
}

type SelectedResultAction =
    | { type: 'init'; results: NLSSearchResult[] }
    | { type: 'add'; results: NLSSearchResult[] }
    | { type: 'remove'; results: NLSSearchResult[] }

function selectedResultsReducer(
    state: Set<NLSSearchResult>,
    action: SelectedResultAction
): Set<NLSSearchResult> {
    switch (action.type) {
        case 'init':
            return new Set(action.results)
        case 'add':
            return new Set([...state, ...action.results])
        case 'remove': {
            const newState = new Set(state)
            for (const result of action.results) {
                newState.delete(result)
            }
            return newState
        }
    }
}
