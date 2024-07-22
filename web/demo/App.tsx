import type { FC } from 'react'

import { CodyWebChat, CodyWebChatProvider, CodyWebHistory, type Repository, getChatTitle } from '../lib'

// Include highlights styles for demo purpose, clients like
// Sourcegraph import highlights styles themselves
import '../../vscode/webviews/utils/highlight.css'
import styles from './App.module.css'

let ACCESS_TOKEN = localStorage.getItem('accessToken')

// Only for testing/demo purpose, in real-life usage consumer
// should provide context repo information for Cody chat component
const MOCK_DOT_COM_SOURCEGRAPH_REPOSITORY: Repository[] = [
    {
        id: 'UmVwb3NpdG9yeTozNjgwOTI1MA==',
        name: 'github.com/sourcegraph/sourcegraph',
    },
]

const MOCK_INITIAL_DOT_COM_CONTEXT = {
    fileURL: '/internal/uploadstore/config.go',
    repositories: MOCK_DOT_COM_SOURCEGRAPH_REPOSITORY,
}

if (!ACCESS_TOKEN) {
    ACCESS_TOKEN = window.prompt('Enter a Sourcegraph.com access token:')
    if (!ACCESS_TOKEN) {
        throw new Error('No access token provided')
    }
    localStorage.setItem('accessToken', ACCESS_TOKEN)
}

export const App: FC = () => {
    return (
        <CodyWebChatProvider
            accessToken={ACCESS_TOKEN}
            serverEndpoint="https://sourcegraph.com"
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
                                            onClick={() => input.createNewChat()}
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
