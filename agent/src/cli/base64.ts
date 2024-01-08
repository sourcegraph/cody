import pako from 'pako'

export function decodeBase64(text: string): any {
    const bytes = Buffer.from(text, 'base64')
    const inflated = pako.ungzip(bytes)
    return JSON.parse(Buffer.from(inflated).toString('utf-8'))
}

export function encodeBase64(textData: any): string {
    const stringified = JSON.stringify(textData)
    const bytes = pako.gzip(stringified)
    console.log({ stringified })
    const deflated = Buffer.from(bytes).toString('base64')
    return deflated
}
