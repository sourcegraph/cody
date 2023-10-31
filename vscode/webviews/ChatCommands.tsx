import React, { useEffect, useRef } from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { CodyPrompt } from '@sourcegraph/cody-shared'
import { ChatCommandsProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './ChatCommands.module.css'

export const ChatCommandsComponent: React.FunctionComponent<React.PropsWithChildren<ChatCommandsProps>> = ({
    chatCommands,
    selectedChatCommand,
    setFormInput,
    setSelectedChatCommand,
    onSubmit,
}) => {
    const commandRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const container = commandRef.current?.parentElement

        // If selected command is first, scroll to top. Otherwise, scroll to bottom
        if (container) {
            if (selectedChatCommand === chatCommands?.length || selectedChatCommand === 0) {
                container.scrollTop = 0
            } else {
                container.scrollTop = container.scrollHeight - container.clientHeight
            }
        }

        commandRef.current?.focus()
    }, [chatCommands, chatCommands?.length, selectedChatCommand, setFormInput])

    const onCommandClick = (slashCommand: string): void => {
        if (!slashCommand) {
            return
        }
        onSubmit(slashCommand, 'user')
        setFormInput('')
        setSelectedChatCommand(-1)
    }

    const commands = chatCommands?.filter(([key]) => key !== 'separator')
    if (!commands?.length || selectedChatCommand === undefined || selectedChatCommand < 0) {
        return null
    }

    const currentIndex = selectedChatCommand === chatCommands?.length ? 0 : selectedChatCommand

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
                    chatCommands?.map(
                        ([, prompt]: [string, CodyPrompt & { isLastInGroup?: boolean; instruction?: string }], i) => {
                            const title = `${prompt.slashCommand}${prompt.instruction ? ` ${prompt.instruction}` : ''}`
                            const hasSeparator = prompt.isLastInGroup && i < chatCommands.length - 1
                            return (
                                <React.Fragment key={prompt.slashCommand}>
                                    <button
                                        ref={currentIndex === i ? commandRef : null}
                                        className={classNames(
                                            styles.commandItem,
                                            currentIndex === i && styles.selected
                                        )}
                                        onClick={() => onCommandClick(prompt.slashCommand)}
                                        type="button"
                                    >
                                        <p className={styles.commandTitle}>{title}</p>
                                        <p className={styles.commandDescription}>{prompt.description}</p>
                                    </button>
                                    {hasSeparator ? <hr className={styles.separator} /> : null}
                                </React.Fragment>
                            )
                        }
                    )}
            </div>
        </div>
    )
}
