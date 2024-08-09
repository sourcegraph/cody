import { test as setup } from '@playwright/test'
import * as dotenv from 'dotenv'
import { CREDENTIALS_ENVFILE_PATH, updateEnvFile } from './credentials-envfile'

// biome-ignore lint/complexity/noBannedTypes: <explanation>
// biome-ignore lint/correctness/noEmptyPattern: <explanation>
setup.extend<{}>({})('credentials', async ({}) => {
    try {
        if (updateEnvFile()) {
            dotenv.config({ path: CREDENTIALS_ENVFILE_PATH })
        }
    } catch {
        // we ignore error
    }
})
