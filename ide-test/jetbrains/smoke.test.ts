//import { spawn } from 'node:child_process'
import { chromium, test } from '@playwright/test'

async function checkTestServerStarted(): Promise<void> {
    let giveUpDeadline = Date.now() + 60 * 1000
    let lastError: Error | undefined
    while (Date.now() < giveUpDeadline) {
        try {
            const response = await fetch('http://localhost:8083/statusz')
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
        /*
        const ideProcess = spawn('./gradlew', [':test-support:runIdeForTesting'], {
            cwd: '../jetbrains',
            env: {
                SKIP_CODE_SEARCH_BUILD: 'true',
                // TODO: Hermetically seal the right Java to use
                ...process.env
            },
            stdio: ['ignore', process.stdout, process.stderr],
        })
            */
        try {
            await checkTestServerStarted()
            const browser = await chromium.connectOverCDP('http://localhost:8083')
            console.log(`${browser} with ${browser.contexts.length} contexts`)
        } finally {
            //ideProcess.kill()
        }
    })
