import type { PlaywrightTestArgs, PlaywrightWorkerArgs } from '@playwright/test'
import type { TestContext, WorkerContext } from '../fixture'
export * as vscode from './vscode'
export * as cody from './cody'
export * as workspace from './workspace'

export type UIXContextFnContext = TestContext & WorkerContext & PlaywrightTestArgs & PlaywrightWorkerArgs
