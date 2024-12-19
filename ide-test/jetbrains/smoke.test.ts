import { spawn } from 'node:child_process'
import { chromium, test } from '@playwright/test'

async function checkTestServerStarted(): Promise<void> {
    let giveUpDeadline = Date.now() + 60 * 1000
    let lastError: Error | undefined
    while (Date.now() < giveUpDeadline) {
        try {
            const response = await fetch('http://localhost:8083/healthz')
            if (response.ok) {
                return
            }
            await new Promise(resolve => setTimeout(resolve, 10))
        } catch (e: unknown) {
            if (e instanceof Error) {
                lastError = e
            }
        }
    }
    if (lastError) {
        throw lastError
    }
    throw new Error('timed out trying to connect to JetBrains test support server')
}

test(
    'loads the plugin and displays content in the sidebar',
    async () => {
        // TODO: Refactor this out into a "JetBrains driver"
        const ideProcess = spawn('./gradlew', [':test-support:runIdeForTesting'], {
            cwd: '../jetbrains',
            env: {
                SKIP_CODE_SEARCH_BUILD: 'true',
                // TODO: Hermetically seal the right Java to use
                ...process.env
            },
            stdio: ['ignore', process.stdout, process.stderr],
        })
        try {
            await checkTestServerStarted()
            // TODO: Poll the development server until it is up
            const browser = await chromium.connectOverCDP('ws://localhost:8083/jb')
            // TODO: Make some assertions
            console.log(browser)
        } finally {
            ideProcess.kill()
        }
    })
