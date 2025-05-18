import type { FC } from 'react'
import { CodyWebChat, type InitialContext } from '../lib'
import { ThinkingDemo } from '../lib/components/ThinkingDemo'

// @ts-ignore
import AgentWorker from '../lib/agent/agent.worker.ts?worker&x=2'

const CREATE_AGENT_WORKER = (): Worker => new AgentWorker({ name: 'demo' }) as Worker

// Include highlights styles for demo purpose, clients like
// Sourcegraph import highlights styles themselves
import '../../vscode/webviews/utils/highlight.css'
import styles from './App.module.css'

const DEFAULT_SERVER_ENDPOINT = 'https://sourcegraph.com'

// To set:
// localStorage.setItem('serverEndpoint', 'https://sourcegraph.test:3443')
const serverEndpoint = localStorage.getItem('serverEndpoint') || DEFAULT_SERVER_ENDPOINT

const accessTokenStorageKey = `accessToken:${serverEndpoint}`
let accessToken = localStorage.getItem(accessTokenStorageKey)

if (!accessToken) {
    accessToken = window.prompt(`Enter an access token for ${serverEndpoint}:`)
    if (!accessToken) {
        throw new Error('No access token provided')
    }
    localStorage.setItem(accessTokenStorageKey, accessToken)
}

const INITIAL_CONTEXT: InitialContext = {
    repository: { id: null, name: 'github.com/sourcegraph/review-agent-sandbox' },
    fileRange: null,
    fileURL: null,
    isDirectory: true,
}

const agentConfig = {
    accessToken,
    serverEndpoint,
    telemetryClientName: 'codydemo.testing',
    createAgentWorker: CREATE_AGENT_WORKER,
}

export const App: FC = () => {
    // For debugging purposes, set to true to show the ThinkingDemo instead of CodyWebChat
    const showThinkingDemo = false // Enable ThinkingDemo for testing

    return (
        <div className={styles.root}>
            {showThinkingDemo ? (
                <ThinkingDemo />
            ) : (
                <CodyWebChat
                    agentConfig={agentConfig}
                    initialContext={INITIAL_CONTEXT}
                    viewType="sidebar"
                />
            )}
        </div>
    )
}
