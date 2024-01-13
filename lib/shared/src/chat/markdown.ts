import { registerHighlightContributions, renderMarkdown as renderMarkdownCommon } from '../common/markdown'

/**
 * Supported URIs to render as links in outputted markdown.
 * - https?: Web
 * - vscode: VS Code URL scheme (open in editor)
 * - command:cody. VS Code command scheme for cody (run command)
 *  - e.g. command:cody.welcome: VS Code command scheme exception we add to support directly linking to the welcome guide from within the chat.
 */
const ALLOWED_URI_REGEXP = /^((https?|vscode):\/\/[^\s#$./?].\S*|command:cody.*)$/i

const DOMPURIFY_CONFIG = {
    ALLOWED_TAGS: [
        'p',
        'div',
        'span',
        'pre',
        'i',
        'em',
        'b',
        'strong',
        'code',
        'pre',
        'blockquote',
        'ul',
        'li',
        'ol',
        'a',
        'table',
        'tr',
        'th',
        'td',
        'thead',
        'tbody',
        'tfoot',
        's',
        'u',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
    ],
    ALLOWED_URI_REGEXP,
    FORBID_ATTR: [
        // Disallow heading ids, or any ids
        'id',
    ],
    FORBID_TAGS: ['style'],
}

/**
 * Render Markdown to safe HTML.
 *
 * NOTE: This only works when called in an environment with the DOM. In the VS
 * Code extension, it only works in the webview context, not in the extension
 * host context, because the latter lacks a DOM. We could use
 * isomorphic-dompurify for that, but that adds needless complexity for now. If
 * that becomes necessary, we can add that.
 */
export function renderCodyMarkdown(markdown: string): string {
    registerHighlightContributions()

    // Add Cody-specific Markdown rendering if needed.
    return renderMarkdownCommon(markdown, {
        breaks: true,
        dompurifyConfig: DOMPURIFY_CONFIG,
        addTargetBlankToAllLinks: true,
    })
}
