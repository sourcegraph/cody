import { SHA256 } from 'crypto-js'

export function getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath
}

export function getCodeBlockId(contents: string, fileName?: string): string {
    // Sanitize the input by removing or replacing problematic characters
    let input = contents.trim()
    if (fileName) {
        input = `${fileName}:${input}`
    }

    // Ensure the input is properly encoded before hashing
    try {
        // Convert to base64 first to handle special characters
        const safeInput = Buffer.from(input).toString('base64')
        return SHA256(safeInput).toString()
    } catch (e) {
        // Fallback to a simpler hash if encoding fails
        return SHA256(input.replace(/[^\x20-\x7E]/g, '')).toString()
    }
}
