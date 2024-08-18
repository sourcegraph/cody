export type { TestOptions, WorkerOptions } from './options'

import { mergeTests, type test } from '@playwright/test'
import NodeHttpAdapter from '@pollyjs/adapter-node-http'
import { Polly } from '@pollyjs/core'
import 'node:http'
import 'node:https'
import { CodyPersister } from '../../../../src/testutils/CodyPersisterV2'

import { kitchensinkFixture } from './kitchensink'
import { type MitMProxy, mitmProxyFixture } from './mitmProxy'
import { type TestOptions, type WorkerOptions, optionsFixture } from './options'
import { pollyFixture } from './polly'
import { vscodeFixture } from './vscode'
export interface WorkerContext {
    validWorkerOptions: WorkerOptions
    debugMode: boolean
}
export type Directory = string
export interface TestContext {
    vscodeUI: {
        url: string
        token: string
        extensionHostDebugPort: number | null
    }
    serverRootDir: Directory
    validOptions: TestOptions & WorkerOptions
    polly: Polly
    mitmProxy: MitMProxy
    //sourcegraphMitM: { endpoint: string; target: string }
    workspaceDir: Directory
    //TODO(rnauta): Make the typing inferred from VSCode directly
    executeCommand: <T = any>(commandId: string, ...args: any[]) => Promise<T>
}

export const fixture = mergeTests(
    optionsFixture,
    mitmProxyFixture,
    pollyFixture,
    vscodeFixture,
    kitchensinkFixture
) as ReturnType<typeof test.extend<TestContext & TestOptions, WorkerContext & WorkerOptions>>

fixture.beforeAll(async () => {
    // This just registers polly adapters, it doesn't actually wire anything up
    await fixture.step('Polly Register', () => {
        Polly.register(NodeHttpAdapter)
        Polly.register(CodyPersister)
    })
})
