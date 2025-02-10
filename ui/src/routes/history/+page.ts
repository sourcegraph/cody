import type { PageLoad } from './$types'

export const load: PageLoad = async ({ parent }) => {
    const { webviewAPIClient } = await parent()
    return {
        historyThreadIDs: webviewAPIClient.api.historyThreadIDs(),
    }
}
