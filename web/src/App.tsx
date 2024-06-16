import { FC } from 'react'

import { CodyWebChat, ChatHistory, CodyWebChatProvider, getChatTitle } from '../lib'
import styles from './App.module.css'
import { Repository } from '../lib/types';

let ACCESS_TOKEN = localStorage.getItem('accessToken')

// Only for testing/demo purpose, in real-life usage consumer
// should provide context repo information for Cody chat component
const MOCK_DOT_COM_SOURCEGRAPH_REPOSITORY: Repository[] = [{
    "id": "UmVwb3NpdG9yeTozNjgwOTI1MA==",
    "name": "github.com/sourcegraph/sourcegraph"
}]

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
            serverEndpoint='https://sourcegraph.com'
            initialContext={{
                repositories: MOCK_DOT_COM_SOURCEGRAPH_REPOSITORY,
                fileURL: '/internal/uploadstore/config.go'
            }}
        >
            <div className={styles.root}>
                <ChatHistory>
                    { input =>
                        <ul className={styles.history}>
                            {input.loading && 'Loading...'}
                            {input.error && <p>Error: {input.error.message}</p>}

                            {!input.loading && !input.error &&
                                <>
                                    {input.chats.map(chat =>
                                        <li key={chat.chatID} className={input.isSelectedChat(chat) ? styles.selected : ''}>
                                            <button
                                                className={styles.select}
                                                onClick={() => input.selectChat(chat)}
                                            >
                                                {getChatTitle(chat)}
                                            </button>
                                            <button className={styles.delete} onClick={() => input.deleteChat(chat)}>
                                                <i className='codicon codicon-trash'/>
                                            </button>
                                        </li>
                                    )}
                                    <li>
                                        <button className={styles.createChat} onClick={input.createNewChat}>
                                            Create new chat +
                                        </button>
                                    </li>
                                </>
                            }
                        </ul>
                    }
                </ChatHistory>
                <CodyWebChat className={styles.container} />
            </div>
        </CodyWebChatProvider>
    )
}
