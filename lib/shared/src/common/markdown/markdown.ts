/**
 * Escapes HTML by replacing characters like `<` with their HTML escape sequences like `&lt;`.
 */
export function escapeHTML(html: string): string {
    return html
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}
