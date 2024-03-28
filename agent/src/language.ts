import path from 'node:path'

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

export function getLanguageForFileName(filePath: string): string {
    const fileName = path.basename(filePath)
    const extension = fileName.split('.').pop() || fileName
    const language = getMapping().get(extension)
    return language || extension
}
