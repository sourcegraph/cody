import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { ChatContextFromInputProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './ChatCommands.module.css'

export const ChatContextFromInputComponent: React.FunctionComponent<
    React.PropsWithChildren<ChatContextFromInputProps>
> = ({ onSelected, inputContextMatches, formInput, selected }) => {
    const selectionRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (selected === undefined || !inputContextMatches?.length) {
            return
        }

        const container = selectionRef.current
        if (container) {
            container.scrollIntoView({ block: 'nearest' })
        }
    }, [inputContextMatches?.length, selected])

    if (!inputContextMatches?.length || formInput.endsWith(' ')) {
        return
    }

    return (
        <div className={classNames(styles.container)}>
            <div className={classNames(styles.headingContainer)}>
                <h3 className={styles.heading}>Add selection as context</h3>
            </div>
            <div className={classNames(styles.commandsContainer)}>
                {inputContextMatches?.map((match, i) => {
                    if (match.kind === 'separator') {
                        return <hr key="separator" className={styles.separator} />
                    }

                    const icon =
                        match.kind === 'file' ? 'file' : match.kind === 'class' ? 'symbol-structure' : 'symbol-method'
                    return (
                        <React.Fragment key={match.fsPath}>
                            <button
                                ref={selected === i ? selectionRef : null}
                                className={classNames(styles.commandItem, selected === i && styles.selected)}
                                onClick={() => onSelected(match, formInput)}
                                type="button"
                                title={`${match.kind} - ${match.description}`}
                            >
                                <p className={styles.commandTitle}>
                                    <i className={`codicon codicon-${icon}`} title={match.kind} />{' '}
                                    <span className={styles.itemTitle}>{match.title}</span>
                                </p>
                                <p className={styles.commandDescription}>{match.description}</p>
                            </button>
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}
