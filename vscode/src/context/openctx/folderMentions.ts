import type {
    ItemsParams,
    ItemsResult,
    MentionsParams,
    MentionsResult,
    MetaResult,
    Provider,
} from '@openctx/client'

interface Settings {
    cwd?: string
}

export const folderMentionsProvider: Provider<Settings> = {
    meta(): MetaResult {
        return { name: 'Folders', mentions: {} }
    },

    async mentions(params: MentionsParams, settings: Settings): Promise<MentionsResult> {
        return [
            { title: 'Folder 1', uri: 'https://example.com/1', description: 'My folder' },
            { title: 'Folder 2', uri: 'https://example.com/2', description: 'My folder' },
        ]
    },

    async items({ mention }: ItemsParams): Promise<ItemsResult> {
        // Instead of actually fetching context for these mentions, we just need to return data that
        // gets converted into ContextItems that `resolveContext` will handle.
        return mention ? [{ title: mention.title, url: mention.uri }] : []
    },
}
