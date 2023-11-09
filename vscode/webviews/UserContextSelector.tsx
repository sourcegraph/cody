import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { UserContextSelectorProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './UserContextSelector.module.css'

export const UserContextSelectorComponent: React.FunctionComponent<
    React.PropsWithChildren<UserContextSelectorProps>
> = ({ onSelected, contextSelection, formInput, selected, setSelectedChatContext }) => {
    const selectionRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (selected === undefined || !contextSelection?.length) {
            return
        }

        const container = selectionRef.current
        if (container) {
            container.scrollIntoView({ block: 'nearest' })
        }
    }, [contextSelection, selected])

    useEffect(() => {
        setSelectedChatContext(0)
    }, [contextSelection, setSelectedChatContext])

    if (!contextSelection?.length || formInput.endsWith(' ')) {
        return
    }

    return (
        <div className={classNames(styles.container)}>
            <div className={classNames(styles.headingContainer)}>
                <h3 className={styles.heading}>Add selection as context</h3>
            </div>
            <div className={classNames(styles.selectionsContainer)}>
                {contextSelection?.map((match, i) => {
                    if (match.fileName === 'separator') {
                        return <hr key="separator" className={styles.separator} />
                    }

                    const icon =
                        match.kind === 'file' ? 'file' : match.kind === 'class' ? 'symbol-structure' : 'symbol-method'
                    const title = match.kind === 'file' ? match.path?.relative : match.fileName
                    const range = match.range ? `:${match.range.start.line + 1}-${match.range.end.line + 1}` : ''
                    const description = match.kind === 'file' ? match.path?.dirname : match.path?.relative + range
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
