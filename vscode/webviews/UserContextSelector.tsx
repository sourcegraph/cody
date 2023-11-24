import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { UserContextSelectorProps } from '@sourcegraph/cody-ui/src/Chat'

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
    }, [contextSelection, setSelectedChatContext])

    if (contextSelection === null) {
        return null
    }

    return (
        <div className={classNames(styles.container)}>
            {contextSelection?.length === 0 || contextSelection?.find(context => context.editorTab) ? (
                <div className={classNames(styles.headingContainer)}>
                    <h3 className={styles.heading}>
                        {!formInput.endsWith('@') && !formInput.endsWith('@#')
                            ? 'No matches found'
                            : formInput.endsWith('#')
                            ? 'Search for a symbol to include...'
                            : 'Search for a file to include, or # to search symbols...'}
                    </h3>
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
                        const title = match.type === 'file' ? match.path?.relative : match.fileName
                        const range = match.range ? `:${match.range.start.line + 1}-${match.range.end.line + 1}` : ''
                        const description = match.type === 'file' ? undefined : match.path?.relative + range
                        return (
                            <React.Fragment key={i}>
                                <button
                                    ref={selected === i ? selectionRef : null}
                                    className={classNames(styles.selectionItem, selected === i && styles.selected)}
                                    onClick={() => onSelected(match, formInput)}
                                    type="button"
                                >
                                    <p className={styles.selectionTitle}>
                                        {icon && (
                                            <>
                                                <i className={`codicon codicon-${icon}`} title={match.kind} />{' '}
                                            </>
                                        )}
                                        <span className={styles.selectionTitleText}>{title}</span>
                                    </p>
                                    {description && <p className={styles.selectionDescription}>{description}</p>}
                                </button>
                            </React.Fragment>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}
