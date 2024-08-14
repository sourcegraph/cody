export function getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath
}

export function getCodeBlockId(contents: string, fileName?: string): string {
    const trimmedContents = contents.trim()

    if (fileName) {
        return `${fileName}:${trimmedContents}`
    }

    return trimmedContents
}
