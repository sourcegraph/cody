import { URI } from 'vscode-uri'
import type { ContextItemWithContent } from '../../codebase-context/messages'
import type { ContextMentionProvider } from '../api'

export const PROMPT_MIXIN_MENTION_PROVIDER: ContextMentionProvider<'mixin'> = {
    id: 'mixin',
    triggerPrefixes: ['snip://'],
    description: 'Include a prompt snippet to stay DRY',
    icon: 'comment-draft',
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
        const keyword = query.split(this.triggerPrefixes[0])[1]
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
                    injectAt: 'preamble',
                    uri: URI.parse(`cody://mixins/${m.id}`),
                    title: m.id,
                    description: m.desc,
                    emoji: m.emoji,
                }) satisfies Awaited<ReturnType<typeof this.queryContextItems>>[number]
        )

        return items
    },

    async resolveContextItem(item, signal) {
        if (item.content !== undefined) {
            return [item as ContextItemWithContent]
        }

        if (item.uri.scheme !== 'cody') {
            //these are external prompts
            return []
        }

        const id = item.uri.path.split('/').at(-1)
        const found: ContextItemWithContent[] = mixins
            .filter(m => m.id === id)
            .map(m => ({
                type: 'mixin',
                provider: 'mixin',
                injectAt: 'preamble',
                uri: URI.parse(`cody://mixins/${m.id}`),
                title: m.id,
                description: m.desc,
                emoji: m.emoji,
                content: m.template,
            }))
        return found
    },
}

type MixinID = string

interface PromptMixinTemplate<ID extends MixinID> {
    readonly id: ID
    desc: string
    emoji: string
    keywords: string[]
    template: string
}

const mixins = [
    {
        id: 'duck',
        desc: 'Ducking Crazy Answers',
        emoji: '🦆',
        keywords: ['duck', 'funny'],
        template:
            'You must answer in the style of a smart duck. Inject lots of duck noises in your answer. Also use lots of emojis that are duck, pond or bird related. You must also end all your messages with a "Did you know..." and an interesting duck fact.',
    } as PromptMixinTemplate<'duck'>,
    {
        id: '5yo',
        desc: 'Responds like a 5-year-old',
        emoji: '👶',
        keywords: ['5yo', '5-year-old', '5 year old', 'basic'],
        template:
            "Respond like you're talking to a 5-years-old. You must also use as many baby and kid references as possible.",
    } as PromptMixinTemplate<'5yo'>,
    {
        id: 'tldr',
        desc: 'Short answers that get to the point',
        emoji: '⏳',
        keywords: ['tldr', 'tl;dr', 'short'],
        template: `Keep your answers very short and direct. Don't give any examples unless asked explicitly. Use as few words as possible to provide an answer to any questions. If an answer requires more text then start by just providing a rough short summary and then ask the user if they want you to expand your answer.`,
    } as PromptMixinTemplate<'tldr'>,
]
