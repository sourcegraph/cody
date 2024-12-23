//import { spawn } from 'node:child_process'
import { chromium, expect, test } from '@playwright/test'
/*
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
*/
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
            // await checkTestServerStarted()
            console.log('about to connect')
            const browser = await chromium.connectOverCDP('http://localhost:8081')
            console.log('connected')
            const contexts = browser.contexts()
            console.log('contexts', contexts)
            expect(contexts.length).toBe(1)
            const context = contexts[0]
            console.log('context', context)
            const pages = context.pages()
            console.log('pages', pages)
            expect(pages.length).toBe(1)
            const page = pages[0]
            console.log('page', page)
            await expect(page.getByText('Deep Cody (Experimental)')).toBeVisible()
        } finally {
            //ideProcess.kill()
        }
    })
