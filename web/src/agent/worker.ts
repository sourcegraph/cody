import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import { Agent } from '../../../agent/src/agent'
import { activate } from '../../../vscode/src/extension.web'

const conn = createMessageConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self))

const agent = new Agent({ extensionActivate: activate, conn })
agent.messageHandler.registerNotification('debug/message', params => {
    console.error(`debug/message: ${params.channel}: ${params.message}`)
})
conn.listen()
