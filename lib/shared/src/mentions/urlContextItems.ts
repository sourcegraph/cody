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

    const content = await fetchContentForURLContextItem(url.toString(), signal)
    if (content === null) {
        return []
    }
    return [
        {
            type: 'file',
            uri: url,
            content,
            source: ContextItemSource.User,
        },
    ]
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
        .replace(/<script[^>]*>.*?<\/script>/g, '')
        .replace(/<style[^>]*>.*?<\/style>/g, '')
        .replace(/<svg[^>]*>.*?<\/svg>/g, '')
        .replace(/<!--.*?-->/g, '')
        .replace(/class=['"][^"']+['"]/g, '')
        .replace(/style=['"][^"']+['"]/g, '')

    // TODO(sqs): Arbitrarily trim the response text to avoid overflowing the context window for the
    // LLM. Ideally we would make the prompt builder prioritize this context item over other context
    // because it is explicitly from the user.
    return bodyWithoutTags.slice(0, 15000)
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
