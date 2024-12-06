import { toUint8Array } from '@sourcegraph/cody-shared'
import pako from 'pako'

export function decodeCompressedBase64(text: string): any {
    const bytes = Buffer.from(text, 'base64')
    const unzipped = pako.ungzip(toUint8Array(bytes))
    return JSON.parse(Buffer.from(unzipped).toString('utf-8'))
}
