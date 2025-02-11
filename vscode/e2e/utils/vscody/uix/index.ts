import {
    type PlaywrightTestArgs,
    type PlaywrightWorkerArgs,
    expect as baseExpect,
} from '@playwright/test'
import type { TestContext, WorkerContext } from '../fixture'
export * as cody from './cody'
export * as vscode from './vscode'
export * as workspace from './workspace'
export * as snapshot from './snapshot'
export * as mitm from './mitm'
// biome-ignore lint/nursery/noRestrictedImports: false positive
export * as telemetry from './telemetry'
import { expect as snapshotExpects } from './snapshot'

export const expect = baseExpect.extend({
    ...snapshotExpects,
})

export type UIXContextFnContext = TestContext & WorkerContext & PlaywrightTestArgs & PlaywrightWorkerArgs
