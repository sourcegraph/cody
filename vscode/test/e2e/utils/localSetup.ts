import type { FullConfig } from 'playwright/test'

import { getAssetsDir, rmSyncWithRetries } from '../helpers'

// Clear out the assets directory if running locally
export default async function (_: FullConfig) {
    rmSyncWithRetries(getAssetsDir(''), { recursive: true, force: true })
}
