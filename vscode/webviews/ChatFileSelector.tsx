import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { ChatInputContextProps } from '@sourcegraph/cody-ui/src/Chat'

import styles from './ChatCommands.module.css'

export const ChatInputContextComponent: React.FunctionComponent<React.PropsWithChildren<ChatInputContextProps>> = ({
    filePaths,
    formInput,
    setFormInput,
    selectedFileMatch,
}) => {
    const selectionRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (selectedFileMatch === undefined || !filePaths?.length) {
            return
        }

        const container = selectionRef.current
        if (container) {
            container.scrollIntoView({ block: 'nearest' })
        }
    }, [filePaths?.length, selectedFileMatch])

    const onFileSelected = (path: string): void => {
        if (!filePaths) {
            return
        }
        // remove everything from the last '@' in formInput
        const lastAtIndex = formInput.lastIndexOf('@')
        if (lastAtIndex >= 0) {
            const inputWithoutFileInput = formInput.slice(0, lastAtIndex + 1)
            // Add empty space at the end to end the file matching process
            setFormInput(`${inputWithoutFileInput}${path} `)
        }
    }

    if (filePaths?.length === undefined) {
        return
    }

    return (
        <div className={classNames(styles.container)}>
            <div className={classNames(styles.headingContainer)}>
                <h3 className={styles.heading}>Add selected file as context...</h3>
            </div>
            <div className={classNames(styles.commandsContainer)}>
                {filePaths?.map((path, i) => {
                    return (
                        <React.Fragment key={path}>
                            <button
                                ref={selectedFileMatch === i ? selectionRef : null}
                                className={classNames(styles.commandItem, selectedFileMatch === i && styles.selected)}
                                onClick={() => onFileSelected(path)}
                                type="button"
                            >
                                <p className={styles.commandTitle}>{path}</p>
                            </button>
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}
