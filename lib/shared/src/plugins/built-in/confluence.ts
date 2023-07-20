import fetch from 'isomorphic-fetch'

import { Plugin, PluginAPI, PluginFunctionOutput, PluginFunctionParameters } from '../api/types'

interface SearchResult {
    content: {
        id: string
    }
    url: string
    excerpt: string
}

interface WikiContent {
    body: {
        storage: {
            value: string
        }
    }
}

const searchWiki = async (query: string, opts: { email: string; token: string; baseUrl: string }): Promise<any> => {
    const searchUrl = `${opts.baseUrl}/wiki/rest/api/search?cql=${encodeURIComponent(`text ~ "${query}"`)}&limit=2`
    const searchOptions = {
        method: 'GET',
        headers: {
            Authorization: 'Basic ' + btoa(opts.email + ':' + opts.token),
            'Content-Type': 'application/json',
        },
    }

    try {
        const searchResponse = await fetch(searchUrl, searchOptions)
        const searchJson = await searchResponse.json()
        const results = searchJson?.results as SearchResult[]

        return results.map(async result => {
            const contentUrl = `${opts.baseUrl}/wiki/rest/api/content/${result.content.id}?expand=body.storage`
            const contentResponse = await fetch(contentUrl, searchOptions)
            const contentJson = await contentResponse.json()
            const content = contentJson as WikiContent
            const sanitizedParagraph = removeHtmlTags(content.body.storage.value)
            const sanitizedBlurb = removeHtmlTags(result.excerpt)
            const text = getSurroundingText(sanitizedParagraph, sanitizedBlurb)
            return {
                content: text,
                url: `${opts.baseUrl}/${result.url}`,
            }
        })
    } catch (error) {
        // Handle and log any errors
        console.error('Error in searchWiki:', error)
        throw error
    }
}

// todo: add isEnabled check function
export const confluencePlugin: Plugin = {
    name: 'Confluence plugin',
    description: 'Search Confluence Wiki pages.',
    dataSources: [
        {
            descriptor: {
                name: 'search_confluence_wiki_pages',
                description:
                    'The API provides a powerful search functionality for finding content within your connected Confluence Wiki. It allows users to search for pages, blog posts, comments, attachments, and other content types within the Confluence space. The search results include the matching piece of content and its unique URL.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description:
                                'Keyword to search against Confluence Wiki pages. It can be a title, a page content, or a page excerpt.',
                        },
                    },
                    required: ['query'],
                },
            },
            handler: async (parameters: PluginFunctionParameters, api: PluginAPI): Promise<PluginFunctionOutput[]> => {
                const { query } = parameters

                const email = api.config?.confluence?.email
                const token = api.config?.confluence?.apiToken
                const baseUrl = api.config?.confluence?.baseUrl
                if (!email || !token || !baseUrl) {
                    return Promise.reject(new Error('Confluence plugin not configured'))
                }
                if (typeof query === 'string') {
                    const items = await searchWiki(query, {
                        email,
                        token,
                        baseUrl,
                    })
                    return Promise.all(items)
                }
                return Promise.reject(new Error('Invalid parameters'))
            },
        },
    ],
}

// This function is meant to sanitize confluence content that's semi-html:
// <h1> hello </h1> and @@@h1@@@ hello @@@endh1@@@ will both result in `hello`.
function removeHtmlTags(input: string): string {
    return input.replace(/<[^>]+>|@@@[^@]+@@@/g, '')
}

function getSurroundingText(paragraph: string, blurb: string): string {
    const blurbIndex = paragraph.indexOf(blurb)
    if (blurbIndex === -1) {
        return ''
    }

    const start = Math.max(0, blurbIndex - 300)
    const end = Math.min(paragraph.length, blurbIndex + blurb.length + 300)
    return paragraph.slice(start, end)
}
