import { spawn } from 'node:child_process'
import { chromium, test } from '@playwright/test'

test(
    'loads the plugin and displays content in the sidebar',
    async () => {
        // TODO: Refactor this out into a "JetBrains driver"
        spawn('./gradlew', [':test-support:runIdeForTesting'], {
            cwd: '../jetbrains',
            env: {
                SKIP_CODE_SEARCH_BUILD: 'true',
            },
            stdio: ['ignore', process.stdout, process.stderr],
        })
        // TODO: Poll the development server until it is up
        const browser = await chromium.connectOverCDP('ws://localhost:8083/jb')
        // TODO: Make some assertions
        console.log(browser)
    })
