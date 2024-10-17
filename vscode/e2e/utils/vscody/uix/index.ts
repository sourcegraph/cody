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
export async function manualControl(
    ctx: Pick<UIXContextFnContext, 'page' | 'context'> & { testInfo: TestInfo }
) {
    const manualControlPage = await ctx.context.newPage()
    await manualControlPage.goto('about:blank')
    await manualControlPage.setContent(manualInputPage())

    await stretchTimeout(
        async () => {
            await new Promise(resolve => {
                manualControlPage.once('close', resolve)
            })
        },
        { max: 60 * 60 * 60 * 1000, testInfo: ctx.testInfo }
    )
}

const manualInputPage = () => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manual Control</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            background: #fff;
            color: #000;
            height: 100vh;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .error {
            max-width: 700px;
            text-align: left;
            padding: 0 20px;
        }
        h1 {
            border-right: 1px solid rgba(0, 0, 0, .3);
            display: inline-block;
            margin: 0;
            margin-right: 20px;
            padding: 10px 23px 10px 0;
            font-size: 24px;
            font-weight: 500;
            vertical-align: top;
        }
        .message {
            display: inline-block;
            text-align: left;
            line-height: 49px;
            height: 49px;
            vertical-align: middle;
        }
        pre {
            text-align: left;
            white-space: pre-wrap;
            word-wrap: break-word;
            background: #f6f8fa;
            padding: 20px;
            border-radius: 5px;
            overflow: auto;
        }
    </style>
</head>
<body>
    <div class="error">
        <h1>Error</h1>
        <div class="message">Manual Control Mode</div>
    </div>
    <p>You have now taken manual control of the test. Switch to the VSCode window tab to provide your input. Close this tab when you're ready to hand control back to the test.</p>
</body>
</html>
`
