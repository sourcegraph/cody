import { URI } from 'vscode-uri'
import { type PromptString, ps } from '../../prompt/prompt-string'
import type { ContextMentionProvider } from '../api'

export const PROMPT_MIXIN_MENTION_PROVIDER: ContextMentionProvider<'mixin'> = {
    id: 'mixin',
    triggerPrefixes: ['&'],
    description: 'Mixin a prompt snippet to stay DRY',
    icon: 'insert',
    /**
     * Given a possibly incomplete URL from user input (that the user may be typing), return context
     * items from fetching the URL and extracting its text content.
     */
    async queryContextItems(query, signal) {
        // const url = tryParsePossiblyIncompleteURL(query)
        // if (url === null) {
        //     return []
        // }

        let matches = mixins
        const keyword = query.split('&')[1]
        if (keyword) {
            matches = matches.filter(mixin => {
                return mixin.keywords.some(kw => kw.startsWith(keyword))
            })
        }

        const items = matches.map(
            m =>
                ({
                    type: 'mixin',
                    provider: 'mixin',
                    uri: URI.parse(`cody://mixins/${m.id}`),
                    title: m.id,
                    description: m.desc,
                    emoji: m.emoji,
                    content: '',
                }) satisfies Awaited<ReturnType<typeof this.queryContextItems>>[number]
        )

        return items
    },

    async resolveContextItem(item, signal) {
        return item as any
        // if (item.content !== undefined) {
        //     return [item as ContextItemWithContent]
        // }
        // const content = await fetchContentForURLContextItem(item.uri.toString(), signal)
        // return content ? [{ ...item, content }] : []
    },
}

type MixinID = string

interface PromptMixinTemplate<ID extends MixinID> {
    readonly id: ID
    desc: string
    emoji: string
    keywords: string[]
    template: PromptString
}

const mixins = [
    {
        id: '5yo',
        desc: 'Responds like a 5-year-old',
        emoji: '👶',
        keywords: ['5yo', '5-year-old', '5 year old', 'basic'],
        template: ps`Respond like you're talking to a 5-years-old`,
    } as PromptMixinTemplate<'5yo'>,
    {
        id: 'tldr',
        desc: 'Short answers that get to the point',
        emoji: '⏳',
        keywords: ['tldr', 'tl;dr', 'short'],
        template: ps`Keep your answers short and direct. Avoid examples. Only give an explanation if prompted to do so`,
    } as PromptMixinTemplate<'tldr'>,
]
