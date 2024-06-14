import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import { Agent } from '@sourcegraph/cody-agent/src/agent'

import { IndexDBStorage } from './index-db-storage'
import { createActivation } from '@sourcegraph/vscode-cody/src/extension.web'

// Mock standard DOM API otherwise Vite client fails to run them in
// web-worker env

// @ts-ignore
self.document.querySelector = () => null
// @ts-ignore
self.document.querySelectorAll = () => []

const conn = createMessageConnection(
    new BrowserMessageReader(self),
    new BrowserMessageWriter(self)
)

const agent = new Agent({
    conn,
    extensionActivate: createActivation({
        createStorage: () => IndexDBStorage.create()
    }),
})

agent.registerNotification('debug/message', params => {
    console.error(`debug/message: ${params.channel}: ${params.message}`)
})

conn.listen()
