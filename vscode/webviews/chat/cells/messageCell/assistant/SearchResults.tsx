import type { ChatMessageWithSearch } from '@sourcegraph/cody-shared'
import { ArrowDown, ExternalLink, Search } from 'lucide-react'
import { useState } from 'react'
import { NLSResultSnippet } from '../../../../components/NLSResultSnippet'
import { Button } from '../../../../components/shadcn/ui/button'
import { useConfig } from '../../../../utils/useConfig'
import { useExperimentalOneBoxDebug } from '../../../../utils/useExperimentalOneBox'
import { InfoMessage } from '../../../components/InfoMessage'

interface SearchResultsProps {
    message: ChatMessageWithSearch
}

const DEFAULT_RESULTS_LIMIT = 5
export const SearchResults = ({ message }: SearchResultsProps) => {
    const experimentalOneBoxDebug = useExperimentalOneBoxDebug()

    const [showAll, setShowAll] = useState(false)

    const totalResults = message.search.response?.results?.results?.length ?? 0

    const {
        config: { serverEndpoint },
    } = useConfig()

    return (
        <>
            {message.search.response?.results?.results?.length > 0 && (
                <div className="tw-flex tw-items-center tw-gap-2 tw-font-bold tw-text-muted-foreground">
                    <Search className="tw-size-8" />
                    Displaying {showAll ? totalResults : DEFAULT_RESULTS_LIMIT} of {totalResults} code
                    search results
                </div>
            )}
            {experimentalOneBoxDebug && <InfoMessage>Query: {message.search.query}</InfoMessage>}
            {!!message.search.response?.results?.results?.length && (
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
            <div className="tw-flex tw-justify-between tw-gap-2 tw-my-4">
                {!showAll && totalResults > DEFAULT_RESULTS_LIMIT ? (
                    <Button onClick={() => setShowAll(true)} variant="outline">
                        <ArrowDown className="tw-size-8" />
                        More results
                    </Button>
                ) : (
                    <div />
                )}
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
