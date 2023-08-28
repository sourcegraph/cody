import extensionMapping from './language-file-extensions.json'

let mapping: Map<string, string> | undefined

function getMapping(): Map<string, string> {
    if (mapping) {
        return mapping
    }
    mapping = new Map<string, string>()
    for (const [language, extensions] of Object.entries(extensionMapping)) {
        for (const extension of extensions) {
            mapping.set(extension, language)
        }
    }
    return mapping
}

export function getLanguageForFileName(filename: string): string {
    const extension = filename.split('.').splice(-1)[0]
    const language = getMapping().get(extension)
    return language || extension
}
