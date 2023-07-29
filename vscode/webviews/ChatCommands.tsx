import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { ChatCommandsProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './ChatCommands.module.css'

export const ChatCommandsComponent: React.FunctionComponent<React.PropsWithChildren<ChatCommandsProps>> = ({
    chatCommands,
    selectedChatCommand,
}) => {
    const displayCommands = chatCommands?.filter(command => command[1]?.slashCommand)
    const selectionRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (selectedChatCommand && selectedChatCommand >= 0 && selectionRef.current) {
            selectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            return
        }
    }, [selectedChatCommand])

    return (
        <div className={classNames(styles.container)}>
            <div className={classNames(styles.commandsContainer)}>
                {displayCommands?.map(([command, prompt], i) => (
                    <button
                        className={classNames(styles.commandItem, selectedChatCommand === i && styles.selected)}
                        key={prompt.slashCommand}
                        onClick={() => {}}
                        type="button"
                        ref={i === selectedChatCommand ? selectionRef : null}
                    >
                        <p className={styles.commandTitle}>{`/${prompt.slashCommand}`}</p>
                        <p className={styles.commandDescription}>{command}</p>
                    </button>
                ))}
            </div>
        </div>
    )
}
