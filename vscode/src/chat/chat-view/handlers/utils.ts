/* filePathRegex captures file paths with optional line/column ranges
 * and query parameters.
 *
 * Breakdown:
 * - `(?:\/[\w\-./]+)`: Matches a file path that starts with `/`, followed
 *    by any word characters (`\w`), dashes (`-`), dots (`.`), or slashes (`/`),
 *    ensuring valid path structures.
 * - `(?:\:([\d]+)(?:-([\d]+))?)?`: Optionally matches a line number after`:`
 *   and an optional range (e.g., `:10` or `:10-20`).
 * - `(?:\?[\w=&]+)?`: Optionally matches query parameters starting with `?`,
 *   followed by key-value pairs.
*/
const FILE_PATH_REGEX = /(?:\/[\w\-./]+(?::([\d]+)(?:-([\d]+))?)?(?:\?[\w=&]+)?)/g;

/*
 * Converts file paths in a string to markdown link syntax
*/
export function makeFilePathsClickable(input: string): string {

    return input.replace(FILE_PATH_REGEX, (match, lineStart, lineEnd) => {
        const lineNumberPart = lineStart
            ? `#L${lineStart}${lineEnd ? `-L${lineEnd}` : ''}`
            : '';

        // Extract the base path without the line number or range
        const basePath = match.split(':')[0].split('?')[0];
        const queryStringPart = match.includes('?') ? match.slice(match.indexOf('?')) : '';

        return `[${match}](${basePath}${lineNumberPart}${queryStringPart})`;
    });
}
