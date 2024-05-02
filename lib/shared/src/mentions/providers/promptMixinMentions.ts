import dedent from 'dedent'
import { URI } from 'vscode-uri'
import type { ContextItemWithContent } from '../../codebase-context/messages'
import type { ContextMentionProvider } from '../api'

export const PROMPT_MIXIN_MENTION_PROVIDER: ContextMentionProvider<'mixin'> = {
    id: 'mixin',
    triggerPrefixes: ['snippet://'],
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
        id: 'visual',
        desc: 'Include some mermaid graphs',
        emoji: '🧜‍♀️',
        keywords: ['visuals', 'visualize', 'visualise', 'visualisation', 'mermaid'],
        template: dedent(
            `
            Whenever useful include a mermaid graph to help visualize the problem or your answer.

            Wrap the code for the graph in a "\`\`\`mermaid \`\`\`" block so it is rendered correctly in markdown.

            After the image also include a description by writing \`__Image **#**: short description__\`. Here # is the number of the image in the conversation. Use this number to refer to the image in any text.

            In your answers always start by providing the images first before adding any additional text or code.`
        ),
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
        id: 'eli5',
        desc: "Explain it to me like I'm 5 years old",
        emoji: '👶',
        keywords: ['5yo', '5-year-old', '5 year old', 'basic'],
        template: dedent(`
            Provide your answer in a way that it is easy to undertand for someone who only has basic coding skills but no specific prior knowledge on the subject.

            If there are any acronyms or technical terms make sure to clearly define them.
            `),
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
            'In your answer don\'t write any new code or solutions. Copy existing code or solutions from the context and make minor tweaks. When tweaking existing code also explain what code you have copied including something like "We can re-use [reference] by making the following adjustments" in your answer. If no code or solution is available in the context try and suggest libraries or SaaS products that already solve the problem. In that case include something like "I wasn\'t able to find an existing solution in your codebase but [library/product] seems to be a good fit for the problem" in your answer.',
    },
    {
        id: 'pseudo',
        desc: 'Pseudo code',
        emoji: '🧩',
        keywords: ['high-level', 'pseudo code', 'pseudo', 'pseudo-code', 'pseudocode'],
        template:
            'Any code provided in your answer must be written as pseudo code. The pseudocode should convey the high-level mechanics of the solution and not the exact syntax.',
    },
]
const mixins: PromptMixinTemplate<(typeof _mixins)[number]['id']>[] = _mixins
