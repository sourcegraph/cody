import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { ChatUserContext } from '@sourcegraph/cody-shared'
import { ChatContextFromInputProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './ChatCommands.module.css'

export const ChatContextFromInputComponent: React.FunctionComponent<
    React.PropsWithChildren<ChatContextFromInputProps>
> = ({ inputContextMatches, formInput, setFormInput, selectedContextMatch }) => {
    const selectionRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (selectedContextMatch === undefined || !inputContextMatches?.length) {
            return
        }

        const container = selectionRef.current
        if (container) {
            container.scrollIntoView({ block: 'nearest' })
        }
    }, [inputContextMatches?.length, selectedContextMatch])

    const onSelectionClick = (match: ChatUserContext): void => {
        if (!inputContextMatches) {
            return
        }
        // remove everything from the last '@' in formInput
        const lastAtIndex = formInput.lastIndexOf('@')
        if (lastAtIndex >= 0) {
            const inputWithoutFileInput = formInput.slice(0, lastAtIndex + 1)
            // Add empty space at the end to end the file matching process
            setFormInput(`${inputWithoutFileInput}${match.title} `)
        }
    }

    if (!inputContextMatches?.length || formInput.endsWith(' ')) {
        return
    }

    return (
        <div className={classNames(styles.container)}>
            <div className={classNames(styles.headingContainer)}>
                <h3 className={styles.heading}>Select file as context</h3>
            </div>
            <div className={classNames(styles.commandsContainer)}>
                {inputContextMatches?.map((match, i) => {
                    const icon =
                        match.kind === 'file' ? 'file' : match.kind === 'class' ? 'symbol-class' : 'symbol-method'
                    return (
                        <React.Fragment key={match.fsPath}>
                            <button
                                ref={selectedContextMatch === i ? selectionRef : null}
                                className={classNames(
                                    styles.commandItem,
                                    selectedContextMatch === i && styles.selected
                                )}
                                onClick={() => onSelectionClick(match)}
                                type="button"
                            >
                                <p className={styles.commandTitle}>
                                    <i className={`codicon codicon-${icon}`} /> <span>{match.title}</span>
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
