import { createController } from '@openctx/vscode-lib'
import { Agent } from '@sourcegraph/cody/src/agent'
import { CommandsProvider } from 'cody-ai/src/commands/services/provider'
import { createActivation } from 'cody-ai/src/extension.web'
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import { IndexDBStorage } from './index-db-storage'

const conn = createMessageConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self))

const agent = new Agent({
    conn,
    extensionActivate: createActivation({
        // Since agent is running within web-worker web sentry service will fail
        // since it relies on DOM API which is not available in web-worker
        createSentryService: undefined,
        createStorage: () => IndexDBStorage.create(),

        createCommandsProvider: () => new CommandsProvider(),

        // Import createController from openctx lib synchronously because
        // dynamic import don't work in web worker when we use it in direct
        // consumer like Sourcegraph repo. Pass it as platform context
        // because sync import breaks agent logic for other clients
        createOpenCtxController: createController,
    }),
})

agent.registerNotification('debug/message', params => {
    console.error(`debug/message: ${params.channel}: ${params.message}`)
})

conn.listen()
