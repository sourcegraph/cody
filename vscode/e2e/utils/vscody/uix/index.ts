import {
    type PlaywrightTestArgs,
    type PlaywrightWorkerArgs,
    type TestInfo,
    expect as baseExpect,
} from '@playwright/test'
import { stretchTimeout } from '../../helpers'
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

/**
 * Waits for a fake condition without triggering a timeout. To continue execution call the __continueTest() function from the console.
 */
export async function wait(ctx: Pick<UIXContextFnContext, 'page'> & { testInfo: TestInfo }) {
    // this works by inserting a fake dom meta dom node into the page and waiting for it to disappear
    // we allow the user to do this by evaluating a script that defines a global function that can be called.
    await ctx.page.evaluate(() => {
        const meta = document.createElement('meta')
        meta.id = 'cody-test-wait-for-condition'
        meta.content = 'true'
        document.head.appendChild(meta)
        //@ts-ignore
        globalThis.__continueTest = () => {
            document.head.removeChild(meta)
        }
    })

    await stretchTimeout(
        async () => {
            await expect(ctx.page.locator('#cody-test-wait-for-condition')).not.toBeAttached({
                timeout: 0,
            })
        },
        { max: 60 * 60 * 60 * 1000, testInfo: ctx.testInfo }
    )
}
