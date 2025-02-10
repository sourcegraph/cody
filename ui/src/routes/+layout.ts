import { createWebviewAPIClient } from '../lib/webview-api/webview-api'
import type { LayoutLoad } from './$types'

export const load: LayoutLoad = async () => {
    const webviewAPIClient = await createWebviewAPIClient()
    return {
        webviewAPIClient,
    }
}

export const ssr = false
