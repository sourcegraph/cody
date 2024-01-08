import pako from 'pako'

export function decodeCompressedBase64(text: string): any {
    const bytes = Buffer.from(text, 'base64')
    const inflated = pako.ungzip(bytes)
    return JSON.parse(Buffer.from(inflated).toString('utf-8'))
}
