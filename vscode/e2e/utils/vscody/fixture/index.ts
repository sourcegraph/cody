export type { TestOptions, WorkerOptions } from './options'
import { mergeTests, type test } from '@playwright/test'
import type { Polly } from '@pollyjs/core'
import 'node:http'
import 'node:https'
import { kitchensinkFixture } from './kitchensink'
import { type MitMProxy, mitmProxyFixture } from './mitmProxy'
import { type TestOptions, type WorkerOptions, optionsFixture } from './options'
import { pollyFixture } from './polly'
// biome-ignore lint/nursery/noRestrictedImports: false positive
import { type TelemetryRecorder, telemetryFixture } from './telemetry'
import { vscodeFixture } from './vscode'

export interface WorkerContext {
    validWorkerOptions: WorkerOptions
}
export type Directory = string
export interface TestContext {
    vscodeUI: {
        url: string
        token: string
        extensionHostDebugPort: number | null
        payload: string[][]
    }
    serverRootDir: Directory
    validOptions: TestOptions & WorkerOptions
    polly: Polly
    telemetryRecorder: TelemetryRecorder
    mitmProxy: MitMProxy
    //sourcegraphMitM: { endpoint: string; target: string }
    workspaceDir: Directory
}

export const fixture = mergeTests(
    optionsFixture,
    mitmProxyFixture,
    pollyFixture,
    telemetryFixture,
    vscodeFixture,
    kitchensinkFixture
) as ReturnType<typeof test.extend<TestContext & TestOptions, WorkerContext & WorkerOptions>>
