import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { ChatCommandsProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './ChatCommands.module.css'

export const ChatCommandsComponent: React.FunctionComponent<React.PropsWithChildren<ChatCommandsProps>> = ({
    chatCommands,
    selectedChatCommand,
    setFormInput,
    setSelectedChatCommand,
    onSubmit,
}) => {
    const commandList = chatCommands?.filter(command => command[1]?.slashCommand)
    const selectionRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (commandList && selectedChatCommand && selectedChatCommand >= 0 && selectionRef.current) {
            selectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            return
        }
    }, [commandList, selectedChatCommand])

    const onCommandClick = (slashCommand?: string): void => {
        if (!slashCommand) {
            return
        }
        onSubmit(slashCommand, 'user')
        setFormInput('')
        setSelectedChatCommand(-1)
    }

    if (!commandList?.length || selectedChatCommand === undefined || selectedChatCommand < 0) {
        return null
    }

    return (
        <div className={classNames(styles.container)}>
            <div className={classNames(styles.commandsTitleContainer)}>
                <button
                    className={classNames(styles.commandItem, styles.commandItemTitle)}
                    key="settings"
                    onClick={() => onCommandClick('/commands-settings')}
                    type="button"
                >
                    <p className={styles.commandTitle}>Commands</p>
                    <p className={styles.commandDescription}>
                        <i className="codicon codicon-gear" />
                    </p>
                </button>
            </div>
            <div className={classNames(styles.commandsContainer)}>
                {chatCommands &&
                    selectedChatCommand >= 0 &&
                    commandList?.map(([command, prompt], i) => (
                        <button
                            className={classNames(styles.commandItem, selectedChatCommand === i && styles.selected)}
                            key={prompt.slashCommand}
                            onClick={() => onCommandClick(prompt.slashCommand)}
                            type="button"
                            ref={i === selectedChatCommand ? selectionRef : null}
                        >
                            <p className={styles.commandTitle}>{prompt.slashCommand}</p>
                            <p className={styles.commandDescription}>{command}</p>
                        </button>
                    ))}
            </div>
        </div>
    )
}
