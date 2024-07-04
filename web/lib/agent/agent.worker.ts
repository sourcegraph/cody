import { createController } from '@openctx/vscode-lib'
import { Agent } from '@sourcegraph/cody/src/agent'
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'

import { createActivation } from 'cody-ai/src/extension.web'
import { IndexDBStorage } from './index-db-storage'

declare const WorkerGlobalScope: never
const isRunningInWebWorker =
    typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope

if (isRunningInWebWorker) {
    // NOTE: If we need to add more hacks, or if this is janky, we should consider just setting
    // `globalThis.window = globalThis` (see
    // https://github.com/sourcegraph/cody/pull/4047#discussion_r1593823318).

    ;(self as any).document = {
        // HACK: @microsoft/fetch-event-source tries to call document.removeEventListener, which is
        // not available in a worker.
        removeEventListener: () => {},

        // HACK: web-tree-sitter tries to read window.document.currentScript, which fails if this is
        // running in a Web Worker.
        currentScript: null,

        // HACK: Vite HMR client tries to call querySelectorAll, which is not
        // available in a web worker, without this cody demo fails in dev mode.
        querySelectorAll: () => [],
    }
    ;(self as any).window = {
        // HACK: @microsoft/fetch-event-source tries to call window.clearTimeout, which fails if this is
        // running in a Web Worker.
        clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),

        document: self.document,
    }
}

const conn = createMessageConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self))

const agent = new Agent({
    conn,
    extensionActivate: createActivation({
        // Since agent is running within web-worker web sentry service will fail
        // since it relies on DOM API which is not available in web-worker
        createSentryService: undefined,
        createStorage: () => IndexDBStorage.create(),

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
