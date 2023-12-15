/**
 * Disabling the following rule is necessary to be consistent with the behavior of the VS Code search
 * panel, which does not support tabbing through list items and requires using the arrow keys.
 */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useEffect, useMemo, useRef } from 'react'

import { debounce } from 'lodash'
import { LRUCache } from 'lru-cache'

import { SearchPanelFile } from '@sourcegraph/cody-shared/src/local-context'

import type { VSCodeWrapper } from './utils/VSCodeApi'

import styles from './SearchPanel.module.css'

const SEARCH_DEBOUNCE_MS = 400

class ResultsCache {
    private cache = new LRUCache<string, SearchPanelFile[]>({
        max: 100,
        ttl: 1000 * 60 * 60, // 1 hour
    })
    private lastReset = 0

    public set(query: string, results: SearchPanelFile[], afterReset: number): void {
        const curTime = Date.now()
        if (curTime - this.lastReset > afterReset) {
            this.cache.set(query, results)
        }
    }

    public get(query: string): SearchPanelFile[] | undefined {
        return this.cache.get(query)
    }

    public clear(): void {
        this.cache.clear()
        this.lastReset = Date.now()
    }
}

function doSearch(
    vscodeAPI: VSCodeWrapper,
    query: string,
    cache?: ResultsCache,
    cacheCallback?: (results: SearchPanelFile[]) => void
): void {
    if (query.length === 0) {
        return
    }
    if (cache) {
        const cachedResults = cache.get(query)
        if (cachedResults && cacheCallback) {
            cacheCallback(cachedResults)
            return
        }
    }
    vscodeAPI.postMessage({ command: 'search', query })
}

const debouncedDoSearch = debounce(doSearch, SEARCH_DEBOUNCE_MS)

export const SearchPanel: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const [query, setQuery] = React.useState('')
    const [searching, setSearching] = React.useState(false)
    const [results, setResults] = React.useState<SearchPanelFile[]>([])
    const [selectedResult, setSelectedResult] = React.useState<[number, number]>([-1, -1])
    const [collapsedFileResults, setCollapsedFileResults] = React.useState<{ [key: number]: boolean }>({})
    const outerContainerRef = useRef<HTMLDivElement>(null)
    const queryInputRef = useRef<HTMLTextAreaElement>(null)
    const resultsCache = useMemo(() => new ResultsCache(), [])

    // Update search results when query changes
    useEffect(() => {
        if (query.trim().length === 0) {
            setSearching(false)
            setResults([])
            setSelectedResult([-1, -1])
            return
        }
        setSearching(true)
        debouncedDoSearch(vscodeAPI, query, resultsCache, cachedResults => {
            setSearching(false)
            setResults(cachedResults)
        })
    }, [vscodeAPI, resultsCache, query])

    // update the search results when we get results from the extension backend
    useEffect(() => {
        return vscodeAPI.onMessage(message => {
            switch (message.type) {
                case 'update-search-results': {
                    if (message.query === query) {
                        setSearching(false)
                        setResults(message.results)
                        setSelectedResult([-1, -1])
                    }
                    // hack: there is a chance the user request predates
                    // the last index update, so we add a 5 sec delay before
                    // we accept new entries into the cache
                    resultsCache.set(message.query, message.results, 5 * 1000)
                    break
                }
                case 'index-updated': {
                    resultsCache.clear()
                    break
                }
            }
        })
    }, [vscodeAPI, resultsCache, query])

    // When selection changes, send a message to the extension indicating the file and range
    useEffect(() => {
        if (selectedResult[0] === -1 || selectedResult[1] === -1) {
            return
        }
        const selectedFile = results[selectedResult[0]]
        const selectedSnippet = selectedFile.snippets[selectedResult[1]]
        vscodeAPI.postMessage({
            command: 'show-search-result',
            uriJSON: selectedFile.uriJSON,
            range: selectedSnippet.range,
        })
    }, [selectedResult, vscodeAPI, results])

    const toggleFileExpansion = React.useCallback((fileIndex: number) => {
        setCollapsedFileResults(prev => {
            const newCollapsedFileResults = { ...prev }
            newCollapsedFileResults[fileIndex] = !prev[fileIndex]
            return newCollapsedFileResults
        })
    }, [])

    const onInputChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setQuery(e.target.value.trim())
    }, [])

    const onInputKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                if (e.metaKey || !resultsCache.get(query)) {
                    // bust cache, send new request immediately
                    debouncedDoSearch.cancel()
                    doSearch(vscodeAPI, query)
                }
            } else if (e.key === 'ArrowDown') {
                // detect if command key is selected
                if (e.metaKey && results.length > 0) {
                    // remove focus from textarea
                    outerContainerRef.current?.focus()
                    if (selectedResult[0] === -1) {
                        setSelectedResult([0, -1])
                    }
                }
                e.stopPropagation()
            } else if (e.key === 'ArrowUp') {
                e.stopPropagation()
            }
        },
        [vscodeAPI, resultsCache, query, results.length, selectedResult]
    )

    const onKeyDownUpdateSelection = React.useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            let [fileIndex, snippetIndex] = selectedResult
            if (fileIndex === -1) {
                return
            }
            if (e.metaKey && e.key === 'ArrowUp') {
                queryInputRef.current?.focus()
                return
            }
            if (e.key === 'ArrowDown') {
                snippetIndex++
                const numSnippets = collapsedFileResults[fileIndex] ? 0 : results[fileIndex].snippets.length
                if (snippetIndex >= numSnippets) {
                    fileIndex++
                    if (fileIndex >= results.length) {
                        return
                    }
                    snippetIndex = -1
                }
                setSelectedResult([fileIndex, snippetIndex])
            } else if (e.key === 'ArrowUp') {
                snippetIndex--
                if (snippetIndex < -1) {
                    fileIndex--
                    if (fileIndex < 0) {
                        return
                    }
                    const numSnippets = collapsedFileResults[fileIndex] ? 0 : results[fileIndex].snippets.length
                    snippetIndex = numSnippets - 1
                }
                if (fileIndex < 0) {
                    setSelectedResult([-1, -1])
                } else {
                    setSelectedResult([fileIndex, snippetIndex])
                }
            } else if (e.key === 'ArrowLeft') {
                if (selectedResult[1] === -1) {
                    // Collapse file
                    setCollapsedFileResults(prev => {
                        const newCollapsedFileResults = { ...prev }
                        newCollapsedFileResults[fileIndex] = true
                        return newCollapsedFileResults
                    })
                } else {
                    // Select file
                    setSelectedResult([selectedResult[0], -1])
                }
            } else if (e.key === 'ArrowRight') {
                if (selectedResult[1] === -1) {
                    if (collapsedFileResults[fileIndex]) {
                        // Expand file
                        setCollapsedFileResults(prev => {
                            const newCollapsedFileResults = { ...prev }
                            delete newCollapsedFileResults[fileIndex]
                            return newCollapsedFileResults
                        })
                    } else {
                        // Select snippet
                        setSelectedResult([selectedResult[0], 0])
                    }
                }
            }
        },
        [selectedResult, results, collapsedFileResults]
    )

    return (
        <div
            role="listbox"
            className={styles.outerContainer}
            onKeyDown={onKeyDownUpdateSelection}
            tabIndex={0}
            ref={outerContainerRef}
        >
            <form className={styles.inputRow}>
                <div className={styles.searchInputContainer}>
                    <textarea
                        placeholder="Search"
                        className={styles.searchInput}
                        onChange={onInputChange}
                        onKeyDown={onInputKeyDown}
                        ref={queryInputRef}
                    />
                </div>
            </form>
            {!searching && query.trim().length === 0 && (
                <p className={styles.instructions}>
                    Search for code using a natural language query, such as “password hashing”, "connection retries", a
                    symbol name, or a topic.
                </p>
            )}
            {!searching && results.length === 0 && query.trim().length !== 0 && (
                <p className={styles.instructions}>No results found</p>
            )}
            <div className={styles.searchResultsContainer}>
                {results.map((result, fileIndex) => (
                    <>
                        {/* File result */}
                        <div
                            key={`${result.uriString}`}
                            className={styles.searchResultRow}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    toggleFileExpansion(fileIndex)
                                    setSelectedResult([fileIndex, 0])
                                }
                            }}
                            onClick={() => {
                                toggleFileExpansion(fileIndex)
                                setSelectedResult([fileIndex, -1])
                            }}
                        >
                            <div
                                className={`${styles.searchResultRowInner} ${
                                    selectedResult[0] === fileIndex &&
                                    selectedResult[1] === -1 &&
                                    styles.searchResultRowInnerSelected
                                }`}
                            >
                                <div
                                    className={styles.searchResultTwistie}
                                    onClick={() => toggleFileExpansion(fileIndex)}
                                    onKeyDown={e => e.key === 'Enter' && toggleFileExpansion(fileIndex)}
                                >
                                    <i
                                        className={`codicon ${
                                            collapsedFileResults[fileIndex]
                                                ? 'codicon-chevron-right'
                                                : 'codicon-chevron-down'
                                        }`}
                                    />
                                </div>
                                <div className={styles.searchResultContent}>
                                    <div className={styles.filematchLabel}>
                                        <span className={styles.filematchIcon}>
                                            <i className="codicon codicon-file-code" />
                                        </span>
                                        <span className={styles.filematchTitle} title={result.basename}>
                                            {result.basename}
                                        </span>
                                        <span className={styles.filematchDescription}>
                                            {result.wsname && (
                                                <span title={result.wsname}>{result.wsname}&nbsp;&middot;&nbsp;</span>
                                            )}
                                            <span title={result.dirname}>{result.dirname}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Snippet results */}
                        {!collapsedFileResults[fileIndex] &&
                            result.snippets.map((snippet, snippetIndex) => (
                                <div
                                    className={styles.searchResultRow}
                                    key={`${result.uriString}#L${snippet.range.start.line}:${snippet.range.start.character}-${snippet.range.end.line}:${snippet.range.end.character}`}
                                    onClick={() => setSelectedResult([fileIndex, snippetIndex])}
                                    onKeyDown={e => e.key === 'Enter' && setSelectedResult([fileIndex, snippetIndex])}
                                >
                                    <div
                                        className={`${styles.searchResultRowInner} ${
                                            selectedResult[0] === fileIndex &&
                                            selectedResult[1] === snippetIndex &&
                                            styles.searchResultRowInnerSelected
                                        }`}
                                    >
                                        <div className={styles.searchResultIndent}>
                                            <div className={styles.searchResultIndentGuide} />
                                        </div>
                                        <div
                                            className={`${styles.searchResultTwistie} ${styles.searchResultTwistieNoindent}`}
                                        />
                                        <div className={styles.searchResultContent}>
                                            {firstInterestingLine(snippet.contents)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </>
                ))}
            </div>
        </div>
    )
}

function firstInterestingLine(contents: string): string {
    const lines = contents.split('\n')
    for (const line of lines) {
        if (line.trim().length > 3) {
            return line
        }
    }
    return lines[0]
}
