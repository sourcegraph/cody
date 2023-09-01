import React, { useRef } from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { ChatCommandsProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './ChatCommands.module.css'

export const ChatCommandsComponent: React.FunctionComponent<React.PropsWithChildren<ChatCommandsProps>> = ({
    formInput,
    chatCommands,
    selectedChatCommand,
    setFormInput,
    setSelectedChatCommand,
    onSubmit,
}) => {
    const selectionRef = useRef<HTMLButtonElement>(null)

    const onCommandClick = (slashCommand?: string): void => {
        if (!slashCommand) {
            return
        }
        onSubmit(formInput, 'user')
        setFormInput('')
        setSelectedChatCommand(-1)
    }

    const commands = chatCommands?.filter(([key]) => key !== 'separator')
    if (!commands?.length || selectedChatCommand === undefined || selectedChatCommand < 0) {
        return null
    }

    return (
        <div className={classNames(styles.container)}>
            <div className={classNames(styles.headingContainer)}>
                <h3 className={styles.heading}>Commands</h3>
                <VSCodeButton
                    className={classNames(styles.settingsButton)}
                    onClick={() => onCommandClick('/commands-settings')}
                    appearance="icon"
                    title="Configure Custom Commands"
                >
                    <i className="codicon codicon-gear" />
                </VSCodeButton>
            </div>
            <div className={classNames(styles.commandsContainer)}>
                {chatCommands &&
                    selectedChatCommand >= 0 &&
                    chatCommands?.map(([key, prompt], i) => {
                        if (key === 'separator') {
                            const isFirstItem = i === 0
                            const isLastItem = i === chatCommands.length - 1
                            const prevIsSeparator = chatCommands[i - 1]?.[0] === 'separator'
                            if (isFirstItem || isLastItem || prevIsSeparator) {
                                return null
                            }
                            return <hr key={i} />
                        }

                        return (
                            <button
                                className={classNames(styles.commandItem, selectedChatCommand === i && styles.selected)}
                                key={prompt.slashCommand}
                                onClick={() => onCommandClick(prompt.slashCommand)}
                                type="button"
                                ref={i === selectedChatCommand ? selectionRef : null}
                            >
                                <p className={styles.commandTitle}>{prompt.label || prompt.slashCommand}</p>
                                <p className={styles.commandDescription}>{prompt.description}</p>
                            </button>
                        )
                    })}
            </div>
        </div>
    )
}
