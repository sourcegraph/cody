import { Agent } from '@sourcegraph/cody-agent/src/agent'
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'

import { createActivation } from 'cody-ai/src/extension.web'
import { IndexDBStorage } from './index-db-storage'

// Mock standard DOM API otherwise Vite client fails to run them in
// web-worker env

// @ts-ignore
self.document.querySelector = () => null
// @ts-ignore
self.document.querySelectorAll = () => []

const conn = createMessageConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self))

const agent = new Agent({
    conn,
    platform: 'browser',
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
