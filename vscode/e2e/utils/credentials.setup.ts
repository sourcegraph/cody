import { test as setup } from '@playwright/test'
import * as dotenv from 'dotenv'
import { CREDENTIALS_ENVFILE_PATH, updateEnvFile } from './vscody/credentials-envfile'

// biome-ignore lint/complexity/noBannedTypes: <explanation>
// biome-ignore lint/correctness/noEmptyPattern: <explanation>
setup.extend<{}>({})('credentials', async ({}) => {
    try {
        // NOTE: VSCode Playwright UI will abort the running test when it
        // detects a file change. So you'll in some cases have to click the run
        // test butotn twice. Every other case seems to work fine.
        if (updateEnvFile()) {
            dotenv.config({ path: CREDENTIALS_ENVFILE_PATH })
        }
    } catch {
        // we ignore error
    }
})
