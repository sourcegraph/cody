import React, { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { type ContextItem, displayPath } from '@sourcegraph/cody-shared'

import styles from './UserContextSelector.module.css'

const STARTER = 'Search for a file to include, or type # to search symbols...'
const FILE_ON_RESULT = 'Search for a file to include...'
const FILE_NO_RESULT = 'No matching files found'
const SYMBOL_ON_RESULT = 'Search for a symbol to include...'
const SYMBOL_NO_RESULT = 'No matching symbols found'

export interface UserContextSelectorProps {
    onSelected: (context: ContextItem, queryEndsWithColon?: boolean) => void
    contextSelection?: ContextItem[]
    selected?: number
    onSubmit: (input: string, inputType: 'user') => void
    setSelectedChatContext: (arg: number) => void
    contextQuery: string
}

export const UserContextSelectorComponent: React.FunctionComponent<
    React.PropsWithChildren<UserContextSelectorProps>
> = ({ onSelected, contextSelection, selected, setSelectedChatContext, contextQuery }) => {
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

    if (contextQuery.endsWith(' ')) {
        return null
    }

    /**
     * Extracts line range information from the context query and displays tips as ghost text.
     */
    const regex = /:(\d+)?(-)?(\d+)?$/
    const match = regex.exec(contextQuery)
    if (match && contextSelection?.length) {
        const [colon, startLine, dash, endLine] = match
        const ghostStart = colon && startLine ? '' : 'line'
        const ghostEnd = dash ? (endLine ? '' : 'line') : '-line'
        const hint = endLine && endLine < startLine ? '(invalid line range)' : '(line range)'
        return (
            <div className={classNames(styles.container)}>
                <div className={classNames(styles.headingContainer)}>
                    <h3 className={styles.heading}>{FILE_ON_RESULT}</h3>
                </div>
                <button
                    className={classNames(styles.selectionItem, styles.selected)}
                    title={contextQuery}
                    type="button"
                    onClick={() => onSelected(contextSelection[0])}
                >
                    <span className={styles.titleAndDescriptionContainer}>
                        <span className={styles.selectionTitle}>
                            {contextQuery}
                            <span className={styles.ghostText}>
                                {ghostStart}
                                {ghostEnd} {hint}
                            </span>
                        </span>
                    </span>
                </button>
            </div>
        )
    }

    if (contextSelection === null || selected === -1) {
        return null
    }

    // Don't display the selector when there is no contextSelection to display AND
    // query ends with a non-alphanumeric character (except #, which is used for symbol query (@#)).
    // e.g. '@abcdefg?' -> false || '@abcdefg?file' -> false
    const endRegex = /[^a-zA-Z0-9#]$/
    if (endRegex.test(contextQuery)) {
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
            {contextQuery.match(/#.{1,2}$/) && !contextSelection?.length ? (
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
                            match.type === 'file' ? undefined : displayPath(match.uri) + range
                        const warning =
                            match.type === 'file' && match.title === 'large-file'
                                ? 'File too large. Type @# to choose a symbol'
                                : undefined
                        return (
                            <React.Fragment key={`${icon}${title}${range}${description}`}>
                                <button
                                    ref={selected === i ? selectionRef : null}
                                    className={classNames(
                                        styles.selectionItem,
                                        selected === i && styles.selected,
                                        warning && styles.showWarning
                                    )}
                                    title={title}
                                    onClick={() => onSelected(match)}
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
                                    {warning && (
                                        <p
                                            className={classNames(
                                                styles.titleAndDescriptionContainer,
                                                styles.warningContainer
                                            )}
                                        >
                                            <span className={styles.warningDescription}>{warning}</span>
                                        </p>
                                    )}
                                </button>
                            </React.Fragment>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}
