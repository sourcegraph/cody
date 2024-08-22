import { SHA256 } from 'crypto-js'

export function getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath
}

export function getCodeBlockId(contents: string, fileName?: string): string {
    let input = contents.trim()
    if (fileName) {
        input = `${fileName}:${input}`
    }
    return SHA256(input).toString()
}
