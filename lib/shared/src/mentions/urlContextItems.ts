import { URI } from 'vscode-uri'
import { type ContextItem, ContextItemSource } from '../codebase-context/messages'

/**
 * Given a possibly incomplete URL from user input (that the user may be typing), return context
 * items from fetching the URL and extracting its text content.
 */
export async function getURLContextItems(
    urlInput: string,
    signal?: AbortSignal
): Promise<ContextItem[]> {
    const url = tryParsePossiblyIncompleteURL(urlInput)
    if (url === null) {
        return []
    }

    try {
        const content = await fetchContentForURLContextItem(url.toString(), signal)
        if (content === null) {
            return []
        }
        return [
            {
                type: 'file',
                uri: url,
                content,
                title: tryGetHTMLDocumentTitle(content),
                source: ContextItemSource.Uri,
            },
        ]
    } catch (error) {
        // Suppress errors because the user might be typing a URL that is not yet valid.
        return []
    }
}

export function isURLContextItem(item: Pick<ContextItem, 'uri'>): boolean {
    return item.uri.scheme === 'http' || item.uri.scheme === 'https'
}

export async function fetchContentForURLContextItem(
    url: string,
    signal?: AbortSignal
): Promise<string | null> {
    const resp = await fetch(url.toString(), { signal })
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
 * Try to parse a possibly incomplete URL from user input. The reason why it's possibly incomplete
 * is that the user may not have finished typing it yet.
 */
function tryParsePossiblyIncompleteURL(urlInput: string): URI | null {
    try {
        const url = URI.parse(urlInput)
        const isValid =
            (url.scheme === 'http' || url.scheme === 'https') &&
            /(localhost|\.\w{2,})(:\d+)?$/.test(url.authority)
        return isValid ? url : null
    } catch (e) {
        return null
    }
}

/**
 * Try to get the title of an HTML document, using incomplete regexp parsing for simplicity (because
 * this feature is experimental and we don't need robustness yet).
 */
function tryGetHTMLDocumentTitle(html: string): string | undefined {
    return html.match(/<title>(?<title>[^<]+)<\/title>/)?.groups?.title
}
