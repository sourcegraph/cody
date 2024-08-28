import type { FC } from 'react'

import { CodyWebChat, type InitialContext } from '../lib'

// @ts-ignore
import AgentWorker from '../lib/agent/agent.worker.ts?worker'

const CREATE_AGENT_WORKER = (): Worker => new AgentWorker() as Worker

// Include highlights styles for demo purpose, clients like
// Sourcegraph import highlights styles themselves
import '../../vscode/webviews/utils/highlight.css'
import styles from './App.module.css'

const DOTCOM_SERVER_ENDPOINT = 'https://sourcegraph.com'

// To set:
//
// localStorage.setItem('serverEndpoint', 'https://sourcegraph.test:3443')
const serverEndpoint = localStorage.getItem('serverEndpoint') || DOTCOM_SERVER_ENDPOINT

const accessTokenStorageKey = `accessToken:${serverEndpoint}`
let accessToken = localStorage.getItem(accessTokenStorageKey)

const MOCK_INITIAL_DOT_COM_CONTEXT: InitialContext = {
    fileURL: 'web/demo',
    fileRange: null,
    isDirectory: true,
    repository: {
        id: 'UmVwb3NpdG9yeTo2MTMyNTMyOA==',
        name: 'github.com/sourcegraph/cody',
    },
}

if (!accessToken) {
    accessToken = window.prompt(`Enter an access token for ${serverEndpoint}:`)
    if (!accessToken) {
        throw new Error('No access token provided')
    }
    localStorage.setItem(accessTokenStorageKey, accessToken)
}

export const App: FC = () => {
    return (
        <div className={styles.root}>
            <CodyWebChat
                accessToken={accessToken}
                serverEndpoint={serverEndpoint}
                createAgentWorker={CREATE_AGENT_WORKER}
                telemetryClientName="codydemo.testing"
                initialContext={MOCK_INITIAL_DOT_COM_CONTEXT}
            />
        </div>
    )
}
