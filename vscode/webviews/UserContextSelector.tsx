import React, { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { displayPath } from '@sourcegraph/cody-shared'
import type { UserContextSelectorProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './UserContextSelector.module.css'
import { CHARS_PER_TOKEN, MAX_CURRENT_FILE_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'

const STARTER = 'Search for a file to include, or type # to search symbols...'
const FILE_ON_RESULT = 'Search for a file to include...'
const FILE_NO_RESULT = 'No matching files found'
const SYMBOL_ON_RESULT = 'Search for a symbol to include...'
const SYMBOL_NO_RESULT = 'No matching symbols found'

export const UserContextSelectorComponent: React.FunctionComponent<
    React.PropsWithChildren<UserContextSelectorProps>
> = ({ onSelected, contextSelection, formInput, selected, setSelectedChatContext, contextQuery }) => {
    const selectionRef = useRef<HTMLButtonElement>(null)

    // biome-ignore lint/correctness/useExhaustiveDependencies: we want this to refresh
    useEffect(() => {
        const container = selectionRef.current
        if (container) {
            container.scrollIntoView({ block: 'nearest' })
        }
    }, [selected])

    useEffect(() => {
        // Set the selected context to the first item whenever the contextSelection changes
        if (contextSelection?.length) {
            setSelectedChatContext(0)
        }
    }, [contextSelection?.length, setSelectedChatContext])

    const headingTitle = useMemo(() => {
        if (!contextQuery.length) {
            return STARTER // for empty query
        }
        const noResult = !contextSelection?.length
        const isSymbolQuery = contextQuery.startsWith('#')
        if (!isSymbolQuery) {
            return noResult ? FILE_NO_RESULT : FILE_ON_RESULT
        }
        // for empty symbol query or with symbol results
        if (contextQuery.endsWith('#') || !noResult) {
            return SYMBOL_ON_RESULT
        }
        return SYMBOL_NO_RESULT
    }, [contextQuery, contextSelection?.length])

    if (contextSelection === null || selected === -1) {
        return null
    }

    // If the query ENDS with a non-alphanumeric character (except #),
    // ex. '@abcdefg?' -> false & '@abcdefg?file' -> false
    // and there is no contextSelection to display,
    // don't display the selector.
    if (/[^a-zA-Z0-9#]$/.test(contextQuery)) {
        if (!contextSelection?.length) {
            return null
        }
    }

    return (
        <div className={classNames(styles.container)}>
            {headingTitle ? (
                <div className={classNames(styles.headingContainer)}>
                    <h3 className={styles.heading}>{headingTitle}</h3>
                </div>
            ) : null}

            {/* VS Code has no API for whether symbols are loading or
                unavailable, so we take a guess: there should be some symbols
                that exist for any given one or two letters, and if not, we give
                them some help to debug the situation themselves */}
            {formInput.match(/@#.{1,2}$/) && !contextSelection?.length ? (
                <p className={styles.emptySymbolSearchTip}>
                    <i className="codicon codicon-info" /> VS Code may require you to open files and
                    install language extensions for accurate results
                </p>
            ) : null}

            {contextSelection?.length ? (
                <div className={classNames(styles.selectionsContainer)}>
                    {contextSelection?.map((match, i) => {
                        const icon =
                            match.type === 'file'
                                ? null
                                : match.kind === 'class'
                                  ? 'symbol-structure'
                                  : 'symbol-method'
                        const title = match.type === 'file' ? displayPath(match.uri) : match.symbolName
                        const range = match.range
                            ? `:${match.range.start.line + 1}-${match.range.end.line + 1}`
                            : ''
                        const description =
                            match.type === 'file'
                                ? match.content &&
                                  estimateTokenCount(match.content) > MAX_CURRENT_FILE_TOKENS
                                    ? 'Large file will be truncated.'
                                    : undefined
                                : displayPath(match.uri) + range
                        return (
                            <React.Fragment key={`${icon}${title}${range}${description}`}>
                                <button
                                    ref={selected === i ? selectionRef : null}
                                    className={classNames(
                                        styles.selectionItem,
                                        selected === i && styles.selected
                                    )}
                                    onClick={() => onSelected(match, formInput)}
                                    type="button"
                                >
                                    {match.type === 'symbol' && icon && (
                                        <>
                                            <i
                                                className={`codicon codicon-${icon}`}
                                                title={match.kind}
                                            />{' '}
                                        </>
                                    )}
                                    <span className={styles.titleAndDescriptionContainer}>
                                        <span className={styles.selectionTitle}>{title}</span>
                                        {description && (
                                            <span className={styles.selectionDescription}>
                                                {description}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            </React.Fragment>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}

function estimateTokenCount(content: string) {
    return Math.round(content.length / CHARS_PER_TOKEN)
}
