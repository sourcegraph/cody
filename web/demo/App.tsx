import { type FC, useEffect, useState } from 'react'
import { type CodyWebAgent, CodyWebChat, type InitialContext, createCodyAgent } from '../lib'

// @ts-ignore
import AgentWorker from '../lib/agent/agent.worker.ts?worker'

const CREATE_AGENT_WORKER = (): Worker => new AgentWorker() as Worker

// Include highlights styles for demo purpose, clients like
// Sourcegraph import highlights styles themselves
import '../../vscode/webviews/utils/highlight.css'
import styles from './App.module.css'

const DEFAULT_SERVER_ENDPOINT = 'https://sourcegraph.sourcegraph.com'

// To set:
//
// localStorage.setItem('serverEndpoint', 'https://sourcegraph.test:3443')
const serverEndpoint = localStorage.getItem('serverEndpoint') || DEFAULT_SERVER_ENDPOINT

const accessTokenStorageKey = `accessToken:${serverEndpoint}`
let accessToken = localStorage.getItem(accessTokenStorageKey)

const MOCK_INITIAL_CONTEXT: InitialContext = {
    fileURL: 'web/demo',
    fileRange: null,
    isDirectory: true,
    repository: {
        id: 'UmVwb3NpdG9yeToyNzU5OQ==',
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
    const [agent, setAgent] = useState<CodyWebAgent | null>(null)

    useEffect(() => {
        createCodyAgent({
            accessToken,
            serverEndpoint,
            createAgentWorker: CREATE_AGENT_WORKER,
            telemetryClientName: 'codydemo.testing',
        }).then(agent => {
            agent?.createNewChat()
            setAgent(agent)
        }, setAgent)
    }, [])

    return (
        <div className={styles.root}>
            <CodyWebChat agent={agent} initialContext={MOCK_INITIAL_CONTEXT} viewType="sidebar" />
        </div>
    )
}
