import {
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
import {
    createContextItem,
    isCodeSearchContextItem,
} from '../../../../../src/context/openctx/codeSearch'
import { LastEditorContext } from '../../../../chat/context'
import { NLSResultSnippet } from '../../../../components/NLSResultSnippet'
import { Button } from '../../../../components/shadcn/ui/button'
import { Label } from '../../../../components/shadcn/ui/label'
import { useTelemetryRecorder } from '../../../../utils/telemetry'
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
    const telemetryRecorder = useTelemetryRecorder()
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
                (result): result is NLSSearchResult => result.__typename === 'FileMatch'
            ) || [],
        [message.search.response]
    )

    const initialResults = useMemo(() => totalResults?.slice(0, DEFAULT_RESULTS_LIMIT), [totalResults])

    const resultsToShow =
        initialResults?.length === totalResults?.length || showAll ? totalResults : initialResults

    // mini-HACK: rather than prop drilling the current repository through to this component,
    // just pull the boosted repo name from the query if it exists. This will break if we
    // change how the current repo is boosted, but it at least doesn't depend on VSCode-specific APIs.
    const boostedRepo = message.search.query.match(/boost:repo\(([^)]+)\)/)?.[1]
    const firstNonBoostedRepoIndex = boostedRepo
        ? resultsToShow.findIndex(
              result => result.__typename === 'FileMatch' && result.repository.name !== boostedRepo
          )
        : undefined
    // don't show filter on first search that returns no results
    // show filter on subsquent filtered searches, we want users to be able to deselect their choices
    const hasResults = initialResults?.length > 0 ? initialResults?.length > 0 : resultsToShow.length > 0

    const showFiltersButton =
        (hasResults && !!message.search.response?.results.dynamicFilters?.length) ||
        message.search.selectedFilters?.length

    const showAddContextCheckbox = hasResults && enableContextSelection

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
            lastEditorRef.current?.filterMentions(mention => !isCodeSearchContextItem(mention))
        }
    }, [enableContextSelection, selectedFollowUpResults, lastEditorRef])

    const handleSelectForContext = useCallback(
        (selected: boolean, result: NLSSearchResult) => {
            telemetryRecorder.recordEvent(
                'onebox.resultContext',
                selected ? 'individualSelected' : 'individualDeselected',
                {
                    metadata: { resultRank: totalResults.indexOf(result) },
                    billingMetadata: { product: 'cody', category: 'billable' },
                }
            )
            updateSelectedFollowUpResults({
                type: selected ? 'add' : 'remove',
                results: [result],
            })
        },
        [totalResults, telemetryRecorder]
    )

    const onFilterSidebarClose = useCallback(() => {
        telemetryRecorder.recordEvent('onebox.filterSidebar', 'closed')
        setShowFiltersSidebar(false)
    }, [telemetryRecorder])

    if (showFiltersModal) {
        return (
            <SearchFiltersModal
                filters={message.search.response?.results.dynamicFilters || []}
                selectedFilters={message.search.selectedFilters || []}
                onSelectedFiltersUpdate={onSelectedFiltersUpdate}
                close={() => {
                    telemetryRecorder.recordEvent('onebox.filterModal', 'closed', {
                        billingMetadata: { product: 'cody', category: 'billable' },
                    })
                    setShowFiltersModal(false)
                }}
            />
        )
    }

    return (
        <div className={styles.root}>
            <div className={classNames(styles.container, 'tw-flex')}>
                {showFiltersSidebar &&
                    (!!message.search.response?.results.dynamicFilters?.length ||
                        !!message.search.selectedFilters?.length) && (
                        <div
                            className={classNames(
                                'tw-min-w-[250px] tw-w-[250px] tw-relative tw-mt-2 tw-p-4 tw-border-r tw-border-border tw-shadow',
                                styles.filtersSidebar
                            )}
                        >
                            <div
                                className="tw-absolute tw-top-5 tw-right-8 tw-text-muted-foreground hover:tw-text-foreground"
                                onClick={onFilterSidebarClose}
                                onKeyDown={onFilterSidebarClose}
                                role="button"
                                title="Close filters sidebar"
                                tabIndex={0}
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
                {!message.text && !!message.search.query && !message.error ? (
                    <div className="tw-flex-1">
                        <LoadingDots />
                    </div>
                ) : null}
                {!!message.text && !!message.search.query && (
                    <div className={classNames('tw-flex-1 tw-grow tw-min-w-0', styles.resultsContainer)}>
                        {!!resultsToShow && (
                            <div
                                className={classNames(
                                    'tw-flex tw-items-center tw-gap-4 tw-justify-between tw-py-4 md:tw-px-4 tw-border-b tw-border-border',
                                    styles.searchResultsHeader
                                )}
                            >
                                <div className="tw-flex tw-gap-4 tw-items-center">
                                    {showFiltersButton && (
                                        <>
                                            <Button
                                                onClick={() => {
                                                    telemetryRecorder.recordEvent(
                                                        'onebox.filterModal',
                                                        'opened',
                                                        {
                                                            billingMetadata: {
                                                                product: 'cody',
                                                                category: 'billable',
                                                            },
                                                        }
                                                    )
                                                    setShowFiltersModal(true)
                                                }}
                                                variant="outline"
                                                className={styles.filtersModalTrigger}
                                            >
                                                {message.search.selectedFilters?.length ? (
                                                    <FilterX className="tw-size-6 md:tw-size-8" />
                                                ) : (
                                                    <FilterIcon className="tw-size-6 md:tw-size-8" />
                                                )}
                                                <span className={styles.searchResultsHeaderLabel}>
                                                    Filters
                                                </span>
                                            </Button>
                                        </>
                                    )}
                                    <div className="tw-flex tw-gap-4 tw-items-center tw-font-medium tw-text-sm tw-text-muted-foreground tw-px-2">
                                        <Search className="tw-size-6 md:tw-size-8 tw-flex-shrink-0" />
                                        Displaying {resultsToShow.length} code search results
                                    </div>
                                </div>
                                <div className="tw-flex tw-items-center tw-gap-6 tw-px-4 md:tw-px-2">
                                    {showFiltersButton && (
                                        <>
                                            <Button
                                                onClick={() => {
                                                    telemetryRecorder.recordEvent(
                                                        'onebox.filterModal',
                                                        'opened',
                                                        {
                                                            billingMetadata: {
                                                                product: 'cody',
                                                                category: 'billable',
                                                            },
                                                        }
                                                    )
                                                    setShowFiltersSidebar(true)
                                                }}
                                                variant="outline"
                                                className={styles.filtersSidebarToggle}
                                            >
                                                {message.search.selectedFilters?.length ? (
                                                    <FilterX className="tw-size-6 md:tw-size-8" />
                                                ) : (
                                                    <FilterIcon className="tw-size-6 md:tw-size-8" />
                                                )}
                                                <span className={styles.searchResultsHeaderLabel}>
                                                    Filters
                                                </span>
                                            </Button>
                                        </>
                                    )}
                                    {showAddContextCheckbox && (
                                        <>
                                            <Label
                                                htmlFor="search-results.select-all"
                                                className={styles.searchResultsHeaderLabel}
                                            >
                                                Add to context
                                            </Label>
                                            <input
                                                type="checkbox"
                                                id="search-results.select-all"
                                                title="Select all results"
                                                checked={
                                                    selectedFollowUpResults.size === resultsToShow.length
                                                }
                                                onChange={event => {
                                                    const checked = event.target.checked

                                                    telemetryRecorder.recordEvent(
                                                        'onebox.results',
                                                        checked ? 'selectAll' : 'deselectAll',
                                                        {
                                                            billingMetadata: {
                                                                product: 'cody',
                                                                category: 'billable',
                                                            },
                                                        }
                                                    )

                                                    if (checked) {
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
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                        {experimentalOneBoxDebug && message.search.query && (
                            <InfoMessage className="tw-mt-4">
                                Query: <code>{message.search.query}</code>
                            </InfoMessage>
                        )}
                        {experimentalOneBoxDebug && message.search.queryWithSelectedFilters && (
                            <InfoMessage className="tw-mt-4">
                                Query with selected filters:{' '}
                                <code>{message.search.queryWithSelectedFilters}</code>
                            </InfoMessage>
                        )}
                        {resultsToShow.length ? (
                            <ul className="tw-list-none tw-flex tw-flex-col">
                                {resultsToShow.map((result, i) => (
                                    <li
                                        // biome-ignore lint/correctness/useJsxKeyInIterable:
                                        // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                        key={i}
                                    >
                                        {i === firstNonBoostedRepoIndex && (
                                            <h6 className="tw-border-b tw-border-border tw-text-muted-foreground tw-p-4 tw-pt-8">
                                                Results from other repositories
                                            </h6>
                                        )}
                                        <NLSResultSnippet
                                            result={result}
                                            selectedForContext={selectedFollowUpResults.has(result)}
                                            onSelectForContext={
                                                enableContextSelection
                                                    ? handleSelectForContext
                                                    : undefined
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
                        <div className="tw-flex tw-justify-between tw-gap-4 tw-my-6 md:tw-px-6">
                            <div className="tw-flex tw-items-center tw-gap-4">
                                {!showAll &&
                                    resultsToShow &&
                                    totalResults &&
                                    resultsToShow !== totalResults && (
                                        <Button
                                            onClick={() => {
                                                telemetryRecorder.recordEvent(
                                                    'onebox.moreResults',
                                                    'clicked',
                                                    {
                                                        metadata: {
                                                            totalResults: totalResults.length,
                                                            resultsAdded:
                                                                totalResults.length -
                                                                resultsToShow.length,
                                                        },
                                                        billingMetadata: {
                                                            product: 'cody',
                                                            category: 'billable',
                                                        },
                                                    }
                                                )
                                                setShowAll(true)
                                                updateSelectedFollowUpResults({
                                                    type: 'add',
                                                    results: totalResults.slice(resultsToShow.length),
                                                })
                                            }}
                                            variant="outline"
                                            size="sm"
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
                                href={'/search'}
                                target="_blank"
                                rel="noreferrer"
                                className="tw-text-foreground"
                                onClick={() => {
                                    telemetryRecorder.recordEvent('onebox.codeSearch', 'clicked', {
                                        metadata: {
                                            totalResults: totalResults.length,
                                            resultsAdded: totalResults.length - resultsToShow.length,
                                        },
                                        billingMetadata: { product: 'cody', category: 'core' },
                                    })
                                }}
                            >
                                <Button variant="outline" size="sm">
                                    Code search <ExternalLink className="tw-size-8" />
                                </Button>
                            </a>
                        </div>
                    </div>
                )}
            </div>
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
