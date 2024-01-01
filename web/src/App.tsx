import React, { useCallback, useEffect, useState } from 'react'

import { Client, createClient, Transcript } from '@sourcegraph/cody-shared/src/chat/client'
import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { ErrorLike, isErrorLike } from '@sourcegraph/cody-shared/src/common'
import type { Editor } from '@sourcegraph/cody-shared/src/editor'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { CodySvg } from '@sourcegraph/cody-ui/src/utils/icons'

import { Chat } from './Chat'
import { Settings } from './settings/Settings'
import { useConfig } from './settings/useConfig'

import styles from './App.module.css'

/* eslint-disable @typescript-eslint/require-await */
const editor: Editor = {
    getActiveTextEditor() {
        return null
    },
    getActiveTextEditorSelection() {
        return null
    },
    getActiveTextEditorSmartSelection() {
        return Promise.resolve(null)
    },
    getActiveTextEditorSelectionOrEntireFile() {
        return null
    },
    getActiveTextEditorSelectionOrVisibleContent() {
        return null
    },
    getActiveTextEditorDiagnosticsForRange() {
        return null
    },
    getActiveTextEditorVisibleContent() {
        return null
    },
    getTextEditorContentForFile(_uri, _range): Promise<string | undefined> {
        return Promise.resolve(undefined)
    },
    getWorkspaceRootPath() {
        return null
    },
    getWorkspaceRootUri() {
        return null
    },
    replaceSelection(_fileName, _selectedText, _replacement) {
        return Promise.resolve()
    },
    async showQuickPick(labels) {
        // TODO: Use a proper UI element
        return window.prompt(`Choose: ${labels.join(', ')}`, labels[0]) || undefined
    },
    async showWarningMessage(message) {
        console.warn(message)
    },
    async showInputBox(prompt?: string) {
        // TODO: Use a proper UI element
        return window.prompt(prompt || 'Enter here...') || undefined
    },
    didReceiveFixupText(_id: string, _text: string, _state: 'streaming' | 'complete'): Promise<void> {
        return Promise.resolve()
    },
}
/* eslint-enable @typescript-eslint/require-await */

export const App: React.FunctionComponent = () => {
    const [config, setConfig] = useConfig()
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [formInput, setFormInput] = useState('')
    const [inputHistory, setInputHistory] = useState<string[] | []>([])

    const [client, setClient] = useState<Client | null | ErrorLike>()
    useEffect(() => {
        setMessageInProgress(null)
        setTranscript([])
        createClient({
            config,
            setMessageInProgress,
            setTranscript: (transcript: Transcript) => setTranscript(transcript.toChat()),
            editor,
        }).then(setClient, setClient)
    }, [config])

    const onSubmit = useCallback(
        (text: string) => {
            if (client && !isErrorLike(client)) {
                // eslint-disable-next-line no-void
                void client.submitMessage(text)
            }
        },
        [client]
    )

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>
                    <CodySvg /> Cody
                </h1>
                <Settings config={config} setConfig={setConfig} />
            </header>
            <main className={styles.main}>
                {client ? (
                    isErrorLike(client) ? (
                        <p>Error: {client.message}</p>
                    ) : (
                        <>
                            <Chat
                                messageInProgress={messageInProgress}
                                transcript={transcript}
                                contextStatus={{ codebase: config.codebase }}
                                formInput={formInput}
                                setFormInput={setFormInput}
                                inputHistory={inputHistory}
                                setInputHistory={setInputHistory}
                                isCodyEnabled={true}
                                onSubmit={onSubmit}
                                userInfo={{
                                    isDotComUser: isDotCom(config.serverEndpoint),
                                    isCodyProUser: false,
                                }}
                            />
                        </>
                    )
                ) : (
                    <>Loading...</>
                )}
            </main>
        </div>
    )
}
