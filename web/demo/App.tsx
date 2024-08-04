import type { FC } from 'react'

import { CodyWebChat, CodyWebChatProvider, type Repository } from '../lib'

// Include highlights styles for demo purpose, clients like
// Sourcegraph import highlights styles themselves
import '../../vscode/webviews/utils/highlight.css'
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
    return (
        <CodyWebChatProvider
            accessToken={accessToken}
            serverEndpoint={serverEndpoint}
            telemetryClientName="codydemo.testing"
            initialContext={MOCK_INITIAL_DOT_COM_CONTEXT}
        >
            <div className={styles.root}>
                <CodyWebChat className={styles.container} />
            </div>
        </CodyWebChatProvider>
    )
}
