import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { displayPath } from '@sourcegraph/cody-shared'
import { type UserContextSelectorProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './UserContextSelector.module.css'

export const UserContextSelectorComponent: React.FunctionComponent<
    React.PropsWithChildren<UserContextSelectorProps>
> = ({ onSelected, contextSelection, formInput, selected, setSelectedChatContext }) => {
    const selectionRef = useRef<HTMLButtonElement>(null)

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

    if (contextSelection === null || selected === -1) {
        return null
    }

    // TODO(toolmantim): Would be nicer to have a Search data type to use
    // instead of recreating string regex logic

    let headingTitle
    if (formInput.endsWith('@')) {
        headingTitle = 'Search for a file to include, or type # to search symbols...'
    } else if (formInput.endsWith('@#')) {
        headingTitle = 'Search for a symbol to include...'
    } else if (formInput.match(/@[^ #]+$/)) {
        headingTitle = contextSelection?.length ? 'Search for a file to include...' : 'No matching files found'
    } else if (formInput.match(/@#[^ ]+$/)) {
        headingTitle = contextSelection?.length ? 'Search for a symbol to include...' : 'No matching symbols found'
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
                    <i className="codicon codicon-info" /> VS Code may require you to open files and install language
                    extensions for accurate results
                </p>
            ) : null}

            {contextSelection?.length ? (
                <div className={classNames(styles.selectionsContainer)}>
                    {contextSelection?.map((match, i) => {
                        const icon =
                            match.type === 'file' ? null : match.kind === 'class' ? 'symbol-structure' : 'symbol-method'
                        const title = match.type === 'file' ? displayPath(match.uri) : match.symbolName
                        const range = match.range ? `:${match.range.start.line + 1}-${match.range.end.line + 1}` : ''
                        const description = match.type === 'file' ? undefined : displayPath(match.uri) + range
                        return (
                            <React.Fragment key={`${icon}${title}${range}${description}`}>
                                <button
                                    ref={selected === i ? selectionRef : null}
                                    className={classNames(styles.selectionItem, selected === i && styles.selected)}
                                    onClick={() => onSelected(match, formInput)}
                                    type="button"
                                >
                                    {match.type === 'symbol' && icon && (
                                        <>
                                            <i className={`codicon codicon-${icon}`} title={match.kind} />{' '}
                                        </>
                                    )}
                                    <span className={styles.titleAndDescriptionContainer}>
                                        <span className={styles.selectionTitle}>{title}</span>
                                        {description && (
                                            <span className={styles.selectionDescription}>{description}</span>
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
