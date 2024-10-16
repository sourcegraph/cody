export function getChatPanelTitle(lastHumanText?: string, truncateTitle = true): string {
    let text = lastHumanText?.trim()?.split('\n')[0]
    if (!text) {
        return 'New Chat'
    }

    // Regex to remove the markdown formatted links with this format: '[_@FILENAME_]()'
    const MARKDOWN_LINK_REGEX = /\[_(.+?)_]\((.+?)\)/g
    text = text.replaceAll(MARKDOWN_LINK_REGEX, '$1')?.trim()
    if (!truncateTitle) {
        return text
    }
    // truncate title that is too long
    return text.length > 25 ? `${text.slice(0, 25).trim()}...` : text
}
