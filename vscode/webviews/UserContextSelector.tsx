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

    if (!contextSelection?.length) {
        return null
    }

    return (
        <div className={classNames(styles.container)}>
            <div className={classNames(styles.headingContainer)}>
                <h3 className={styles.heading}>Select a file...</h3>
            </div>
            <div className={classNames(styles.selectionsContainer)}>
                {contextSelection?.map((match, i) => {
                    const icon =
                        match.type === 'file' ? 'file' : match.kind === 'class' ? 'symbol-structure' : 'symbol-method'
                    const title = match.type === 'file' ? match.path?.relative : match.fileName
                    const range = match.range ? `:${match.range.start.line + 1}-${match.range.end.line + 1}` : ''
                    const description = match.type === 'file' ? match.path?.dirname : match.path?.relative + range
                    return (
                        <React.Fragment key={match.path?.relative}>
                            <button
                                ref={selected === i ? selectionRef : null}
                                className={classNames(styles.selectionItem, selected === i && styles.selected)}
                                onClick={() => onSelected(match, formInput)}
                                type="button"
                                title={`${match.kind} @${description}`}
                            >
                                <p className={styles.selectionTitle}>
                                    <i className={`codicon codicon-${icon}`} title={match.kind} />{' '}
                                    <span className={styles.selectionTitleText}>{title}</span>
                                </p>
                                <p className={styles.selectionDescription}>{description}</p>
                            </button>
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}
