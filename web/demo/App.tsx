import type { FC } from 'react'
import { CodyWebChat, type InitialContext } from '../lib'

// @ts-ignore
import AgentWorker from '../lib/agent/agent.worker.ts?worker'

const CREATE_AGENT_WORKER = (): Worker => new AgentWorker() as Worker

// Include highlights styles for demo purpose, clients like
// Sourcegraph import highlights styles themselves
import '../../vscode/webviews/utils/highlight.css'
import styles from './App.module.css'

const MOCK_INITIAL_CONTEXT: InitialContext = {
    fileURL: 'web/demo',
    fileRange: null,
    isDirectory: true,
    repository: {
        id: 'UmVwb3NpdG9yeToyNzU5OQ==',
        name: 'github.com/sourcegraph/cody',
    },
}

export const App: FC = () => {
    return (
        <div className={styles.root}>
            <CodyWebChat
                createAgentWorker={CREATE_AGENT_WORKER}
                telemetryClientName="codydemo.testing"
                initialContext={MOCK_INITIAL_CONTEXT}
            />
        </div>
    )
}
