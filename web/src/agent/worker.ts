import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import { Agent } from '../../../agent/src/agent'
import { createActivation } from '../../../vscode/src/extension.web'
import { IndexDBStorage } from './index-db-storage'

const conn = createMessageConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self))

const agent = new Agent({
    conn,
    extensionActivate: createActivation({
        // Since agent is running within web-worker web sentry service will fail
        // since it relies on DOM API which is not available in web-worker
        createSentryService: undefined,
        createStorage: () => IndexDBStorage.create(),
    }),
})
agent.registerNotification('debug/message', params => {
    console.error(`debug/message: ${params.channel}: ${params.message}`)
})
conn.listen()
