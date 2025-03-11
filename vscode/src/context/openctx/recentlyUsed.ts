import type { Item, Mention } from '@openctx/client'
import type { ContextItem } from '@sourcegraph/cody-shared'
import {
    RECENTLY_USED_PROVIDER_URI,
    displayPathBasename,
    getRecentlyUsedContextItems,
} from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'

import type { OpenCtxProvider } from './types'

const RecentlyUsedProvider = createRecentlyUsedProvider()

export function createRecentlyUsedProvider(customTitle?: string): OpenCtxProvider {
    return {
        providerUri: RECENTLY_USED_PROVIDER_URI,

        meta() {
            return {
                name: customTitle ?? 'Recently Used',
                mentions: {},
            }
        },

        async mentions({ query }) {
            const items = getRecentlyUsedContextItems(query?.trim())

            // Convert to mentions
            return items.map(
                item =>
                    ({
                        uri: item.uri.toString(),
                        title: item.title || '',
                        description: item.description || '',
                        data: {
                            item,
                        },
                    }) satisfies Mention
            )
        },

        async items({ mention }) {
            if (!mention?.data?.item) {
                return []
            }

            const item = mention.data.item as ContextItem

            return [
                {
                    url: item.uri.toString(),
                    title: item.title || displayPathBasename(URI.parse(item.uri.toString())),
                    ai: {
                        content: item.content || '',
                    },
                },
            ] satisfies Item[]
        },
    }
}

export default RecentlyUsedProvider
