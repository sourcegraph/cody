/**
 * Returns the base language id for the given language id. This is used to determine which language
 * IDs can be included as context for a given language ID.
 *
 * TODO(beyang): handle JavaScript <-> TypeScript and verify this works for C header files omit
 * files of other languages
 */
export function baseLanguageId(languageId: string): string {
    switch (languageId) {
        case 'typescript':
        case 'typescriptreact':
            return 'typescript'
        case 'javascript':
        case 'javascriptreact':
            return 'javascript'
        default:
            return languageId
    }
}
