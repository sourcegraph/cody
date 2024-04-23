import { URI } from 'vscode-uri'
import type { ContextItemFromProvider, ContextMentionProvider } from '../api'

export const RESPONSE_STYLE_CONTEXT_PROVIDER: ContextMentionProvider<'responseStyle'> = {
    id: 'responseStyle',
    triggers: ['#'],
    triggerPrefixes: [],

    /**
     * Given a possibly incomplete URL from user input (that the user may be typing), return context
     * items from fetching the URL and extracting its text content.
     */
    //TODO: We can have many sources of instruction templates. E.g. built-in, repo, Sourcegraph setup, etc.
    async queryContextItems(query, signal) {
        const queryTerms = query
            .toLowerCase()
            .replaceAll(/[^a-zA-Z\s]/g, '')
            .split(/\s+/)

        //sort built in tempaltes by the amount of matching terms
        const matchingTemplates = TEMPORARY_BUILT_IN_STYLE_TEMPLATES.map(template => {
            const matchingTerms = queryTerms.filter(term => template.searchTerms.has(term))
            return {
                ...template,
                matchingTermsCount: matchingTerms.length,
            }
        })
            .filter(item => item.matchingTermsCount > 0)
            .sort((a, b) => b.matchingTermsCount - a.matchingTermsCount)

        return matchingTemplates
    },

    async resolveContextItem(item, signal) {
        return [item as typeof item & { content: string }]
    },
}

type StyleTemplate = ContextItemFromProvider<'responseStyle'> & {
    description: string
    searchTerms: Set<string>
}

const TEMPORARY_BUILT_IN_STYLE_TEMPLATES: StyleTemplate[] = [
    {
        title: '🐤|rubber-duck',
        description: 'Helps the user think through a problem out loud by asking clarifying questions',
        searchTerms: new Set(['rubber', 'duck', 'think', 'aloud', 'rubberduck']),
        provider: 'responseStyle',
        type: 'instruction',
        //TODO: Make a service for fetching local "meta" files that aren't part of the repo such as user specified templates etc that could either be built-in, .cody folder or on the sorucegraph instance
        uri: URI.parse('cody://templates/responseStyles/rubberDuck.hb'),
        content:
            'You are helping me think through this problem out loud. You will not provide direct answers, but will ask clarifying questions to help me work through it myself.',
    },
    {
        title: '👶|explain-like-im-five',
        description: 'Requests a simple explanation using an elementary school level of',
        searchTerms: new Set(['explain', 'like', 'im', 'five', 'simple', 'elementary']),
        provider: 'responseStyle',
        type: 'instruction',
        uri: URI.parse('cody://templates/responseStyles/explainLikeImFive.hb'),
        content:
            'Please explain the topic to me as if I were a child in elementary school. Use simple words and provide context as needed without assuming prior knowledge on my part. Clearly introduce any technical jargon and provide an explanation or link to relevant resources to learn more.',
    },
    {
        title: '⏳|tldr',
        description: 'Requests short and direct answers without additional context',
        searchTerms: new Set(['tldr', 'short', 'direct', 'brief']),
        provider: 'responseStyle',
        type: 'instruction',
        uri: URI.parse('cody://templates/responseStyles/tldr.hb'),
        content:
            'I am very busy so please only provide short answers that directly answer my requests. If I need any more information I will explicitly ask for it.',
    },
    {
        title: '📚|deep-dive',
        description: 'Requests a thorough explanation with additional context and references',
        searchTerms: new Set([
            'deep',
            'dive',
            'deepdive',
            'thorough',
            'explanation',
            'context',
            'references',
        ]),
        provider: 'responseStyle',
        type: 'instruction',
        uri: URI.parse('cody://templates/responseStyles/deepDive.hb'),
        content:
            "Please provide a detailed explanation with relevant context and references. I want to fully understand this topic so don't hold back on details or supporting information.",
    },
    {
        title: '🛞|dont-reinvent-the-wheel',
        description:
            'Requests a response that references existing solutions before suggesting new ideas or bespoke code',
        searchTerms: new Set(['dont', 'reinvent', 'wheel', 'existing', 'solutions', 'references']),
        provider: 'responseStyle',
        type: 'instruction',
        uri: URI.parse('cody://templates/responseStyles/dontReinventTheWheel.hb'),
        content:
            'Before providing a new solution, please check if there is an existing library, package or code snippet that solves my problem. Reference any relevant existing work and only suggest a bespoke implementation if nothing suitable already exists.',
    },
]
