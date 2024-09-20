import { test as setup } from '@playwright/test'
import * as dotenv from 'dotenv'
import { CREDENTIALS_ENVFILE_PATH, updateEnvFile } from './vscody/credentials-envfile'

setup.extend<{}>({})('credentials', async ({}) => {
    // NOTE: VSCode Playwright UI will abort the running test when it
    // detects a file change. So you'll in some cases have to click the run
    // test button twice. Every other case seems to work fine.
    if (await updateEnvFile()) {
        dotenv.config({ path: CREDENTIALS_ENVFILE_PATH })
    }
})
