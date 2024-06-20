const typeScriptFamily = new Set(['typescript', 'typescriptreact'])
const javaScriptFamily = new Set(['javascript', 'javascriptreact'])
const cssFamily = new Set(['css', 'less', 'scss', 'sass'])
const htmlFamily = new Set([
    'typescriptreact',
    'javascriptreact',
    'html',
    'handlebars',
    'vue-html',
    'razor',
    'php',
    'haml',
    // This omits vue and svelte as these languages usually do not
    // import CSS modules but define them in the same file instead.
])

/**
 * Returns true if the given language ID should be used as context for the base
 * language id.
 */
export function shouldBeUsedAsContext(
    enableExtendedLanguagePool: boolean,
    baseLanguageId: string,
    languageId: string
): boolean {
    if (baseLanguageId === languageId) {
        return true
    }

    if (typeScriptFamily.has(baseLanguageId) && typeScriptFamily.has(languageId)) {
        return true
    }
    if (javaScriptFamily.has(baseLanguageId) && javaScriptFamily.has(languageId)) {
        return true
    }

    if (enableExtendedLanguagePool) {
        // Allow template languages to use css files as context (in the hope
        // that this allows filling class names more effectively)
        if (htmlFamily.has(baseLanguageId) && cssFamily.has(languageId)) {
            return true
        }
        // Allow css files to use template languages
        if (cssFamily.has(baseLanguageId) && htmlFamily.has(languageId)) {
            return true
        }
    }

    return false
}
