import type { PageLoad } from './$types'

export const load: PageLoad = async ({ parent }) => {
    const { webviewAPIClient } = await parent()
    return {
        threadHistory: webviewAPIClient.api.observeHistory(),
    }
}
