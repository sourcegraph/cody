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

const _mixins = [
    {
        id: 'duck',
        desc: 'Ducking Crazy Answers',
        emoji: '🦆',
        keywords: ['duck', 'funny'],
        template:
            'You must answer in the style of a smart duck. Inject lots of duck noises in your answer. Also use lots of emojis that are duck, pond or bird related. You must also end all your messages with a "Did you know..." and an interesting duck fact.',
    },
    {
        id: 'explore',
        desc: 'Try all options, see what sticks',
        emoji: '🎲',
        keywords: ['shotgun', 'options', 'throw mud at wall', 'explore', 'fanout', 'diamond'],
        template: `You will help a user explore different options to a problem or question. Therefore you don't immediately provide a solution to a problem. Instead you must first list a few diverse options in a numbered list and ask the user to choose which option they would like you to go with by asking "Let me know which (if any) option you'd like me to go with.". Make sure to keep the list of options concise and only expand on the option chosen by the user.`,
    },
    {
        id: 'procon',
        desc: `Include pro's and con's`,
        emoji: '🚦',
        keywords: ['pros', 'cons', 'evalutate', `pro's and con's`, 'benefits', 'downsides'],
        template: `For any solution or answer that you provide you must include a brief pro's and con's list. Start the list with a "**Pro/Con**" title. Don't use normal list bullets like * instead prefix each item with either a 🔴 (con), 🟡 (not necessarily a con but important consideration), 🟢 (pro).`,
    },
    {
        id: '5yo',
        desc: "Explain like I'm 5",
        emoji: '👶',
        keywords: ['5yo', '5-year-old', '5 year old', 'basic'],

        //TODO: This prompt sucks
        template:
            "Respond like you're talking to a beginner with no prior technical knowledge. Make sure to introduce terms and technical jargon and provide a list of topics the user should dive further into for more information. Don't assume the user knows everything. Don't assume the user knows what they're looking for.",
    },
    {
        id: 'tldr',
        desc: 'Short answers that get to the point',
        emoji: '⏳',
        keywords: ['tldr', 'tl;dr', 'short'],
        template: `Keep your answers very short and direct. Don't give any examples unless asked explicitly. Use as few words as possible to provide an answer to any questions. If an answer requires more text then start by just providing a rough short summary and then ask the user "Do you want me to elaborate on that?".`,
    },
    {
        id: 'tdd',
        desc: 'Test Driven Development',
        emoji: '🧪',
        keywords: ['tests', 'tdd', 'test driven development'],
        template:
            "When providing an answer that requires code also at the end include some basic test code or script to verify that the code you provided indeed works as expected. Include comments in the code to explain exactly what is being tested if this is not obvious from the code itself. Don't test every detail but rather focus on the most important parts.",
    },
    {
        id: 'reuse',
        desc: 'Re-use existing code/solutions',
        emoji: '♻️',
        keywords: ["don't reinvent the wheel", 'giant', 'stand on the shoulders of giants', 'reuse'],
        template:
            'When providing an answer avoid writing as much code as possible and instead try to re-use existing code or recommend existing solutions, libraries or SaaS products.',
    },
    {
        id: 'visual',
        desc: 'Generate visuals (TODO)',
        emoji: '🎨',
        keywords: ['visuals', 'visualize', 'visualise', 'visualisation'],
        template: 'TODO',
    },
]
const mixins: PromptMixinTemplate<(typeof _mixins)[number]['id']>[] = _mixins
