import type { FC } from 'react'

import {
    CodyWebChat,
    type CodyWebChatContextClient,
    CodyWebChatProvider,
    CodyWebHistory,
    type Repository,
    getChatTitle,
} from '../lib'

// Include highlights styles for demo purpose, clients like
// Sourcegraph import highlights styles themselves
import '../../vscode/webviews/utils/highlight.css'
import { useRef } from 'react'
import styles from './App.module.css'

const DOTCOM_SERVER_ENDPOINT = 'https://sourcegraph.com'

// To set:
//
//   localStorage.setItem('serverEndpoint', 'https://sourcegraph.test:3443')
const serverEndpoint = localStorage.getItem('serverEndpoint') || DOTCOM_SERVER_ENDPOINT

const accessTokenStorageKey = `accessToken:${serverEndpoint}`
let accessToken = localStorage.getItem(accessTokenStorageKey)

// Only for testing/demo purpose, in real-life usage consumer
// should provide context repo information for Cody chat component
const MOCK_DOT_COM_SOURCEGRAPH_REPOSITORY: Repository[] =
    serverEndpoint === DOTCOM_SERVER_ENDPOINT
        ? [
              {
                  id: 'UmVwb3NpdG9yeTozNjgwOTI1MA==',
                  name: 'github.com/sourcegraph/sourcegraph',
              },
          ]
        : []

const MOCK_INITIAL_DOT_COM_CONTEXT =
    serverEndpoint === DOTCOM_SERVER_ENDPOINT
        ? {
              fileURL: 'internal/codeintel/ranking/internal/background/mapper/config.go',
              repositories: MOCK_DOT_COM_SOURCEGRAPH_REPOSITORY,
          }
        : undefined

if (!accessToken) {
    accessToken = window.prompt(`Enter an access token for ${serverEndpoint}:`)
    if (!accessToken) {
        throw new Error('No access token provided')
    }
    localStorage.setItem(accessTokenStorageKey, accessToken)
}

export const App: FC = () => {
    const rootRef = useRef<CodyWebChatContextClient>(null)

    return (
        <CodyWebChatProvider
            ref={rootRef}
            accessToken={accessToken}
            serverEndpoint={serverEndpoint}
            telemetryClientName="codydemo.testing"
            initialContext={MOCK_INITIAL_DOT_COM_CONTEXT}
        >
            <div className={styles.root}>
                <CodyWebHistory>
                    {input => (
                        <ul className={styles.history}>
                            {input.loading && 'Loading...'}
                            {input.error && <p>Error: {input.error.message}</p>}

                            {!input.loading && !input.error && (
                                <>
                                    {input.chats.map(chat => (
                                        <li
                                            key={chat.chatID}
                                            className={input.isSelectedChat(chat) ? styles.selected : ''}
                                        >
                                            <button
                                                type="button"
                                                className={styles.select}
                                                onClick={() => input.selectChat(chat)}
                                            >
                                                {getChatTitle(chat)}
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.delete}
                                                onClick={() => input.deleteChat(chat)}
                                            >
                                                <i className="codicon codicon-trash" />
                                            </button>
                                        </li>
                                    ))}
                                    <li>
                                        <button
                                            type="button"
                                            className={styles.createChat}
                                            onClick={() => rootRef.current?.createNewChat()}
                                        >
                                            Create new chat +
                                        </button>
                                    </li>
                                </>
                            )}
                        </ul>
                    )}
                </CodyWebHistory>
                <CodyWebChat className={styles.container} />
            </div>
        </CodyWebChatProvider>
    )
}
