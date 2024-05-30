import type { ItemsParams, ItemsResult, Provider } from '@openctx/client'

/**
 * An OpenCtx provider that fetches the content of a URL and provides it as an item.
 */
const WebProvider: Provider & { providerUri: 'internal-web-provider' } = {
    providerUri: 'internal-web-provider',

    meta() {
        return {
            name: 'Web URLs',
            mentions: {},
        }
    },

    async mentions({ query }) {
        const [item] = await fetchItem({ message: query }, 2000)
        if (!item) {
            return []
        }

        return [{ title: item.title, uri: item.url || '', data: { content: item.ai?.content } }]
    },

    async items(params) {
        return fetchItem(params)
    },
}

async function fetchItem(params: ItemsParams, timeoutMs?: number): Promise<ItemsResult> {
    if (typeof params.mention?.data?.content === 'string') {
        return [
            {
                ...params.mention,
                url: params.mention.uri,
                ui: { hover: { text: `Fetched from ${params.mention.uri}` } },
                ai: { content: params.mention.data.content },
            },
        ]
    }

    const url = params.message || params.mention?.uri
    if (!url) {
        return []
    }
    try {
        const content = await fetchContentForURLContextItem(
            url,
            timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
        )

        if (content === null) {
            return []
        }
        return [
            {
                url,
                title: tryGetHTMLDocumentTitle(content) ?? url,
                ui: { hover: { text: `Fetched from ${url}` } },
                ai: { content: content },
            },
        ]
    } catch (error) {
        // Suppress errors because the user might be typing a URL that is not yet valid.
        return []
    }
}

async function fetchContentForURLContextItem(
    urlStr: string,
    signal?: AbortSignal
): Promise<string | null> {
    const url = new URL(urlStr)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null
    }
    if (!/(localhost|\.\w{2,})$/.test(url.hostname)) {
        return null
    }

    const resp = await fetch(urlStr, { signal })
    if (!resp.ok) {
        return null
    }
    const body = await resp.text()

    // HACK(sqs): Rudimentarily strip HTML tags, script, and other unneeded elements from body using
    // regexp. This is NOT intending to be a general-purpose HTML parser and is NOT sanitizing the
    // value for security.
    const bodyWithoutTags = body
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
        .replace(/<!--.*?-->/gs, '')
        .replace(/\s(?:class|style)=["'][^"']*["']/gi, '')
        .replace(/\sdata-[\w-]+(=["'][^"']*["'])?/gi, '')

    // TODO(sqs): Arbitrarily trim the response text to avoid overflowing the context window for the
    // LLM. Ideally we would make the prompt builder prioritize this context item over other context
    // because it is explicitly from the user.
    const MAX_LENGTH = 14000
    return bodyWithoutTags.length > MAX_LENGTH
        ? `${bodyWithoutTags.slice(0, MAX_LENGTH)}... (web page content was truncated)`
        : bodyWithoutTags
}

/**
 * Try to get the title of an HTML document, using incomplete regexp parsing for simplicity (because
 * this feature is experimental and we don't need robustness yet).
 */
function tryGetHTMLDocumentTitle(html: string): string | undefined {
    return html
        .match(/<title>(?<title>[^<]+)<\/title>/)
        ?.groups?.title.replaceAll(/\s+/gm, ' ')
        .trim()
}

export default WebProvider
