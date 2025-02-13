// Converts the prefix of buf to a UTF8 string. If buf terminates in the middle
// of a character, returns the remaining bytes of the partial character in a
// new buffer. Note! This assumes that the prefix of buf *is* valid UTF8--it
// only examines the bytes of the last character in the buffer and assumes it

import type { AuthCredentials } from '..'

// will find an initial byte before the start of the buffer.
export function toPartialUtf8String(buf: Buffer): { str: string; buf: Buffer } {
    if (buf.length === 0) {
        return { str: '', buf: Buffer.of() }
    }
    let lastValidByteOffsetExclusive = buf.length
    if ((buf[lastValidByteOffsetExclusive - 1] & 0x80) !== 0) {
        // Multi-byte character. Count additional trailing bytes. UTF8 trailing
        // bytes have the bit pattern 10??_????.
        let numBytes = 1
        while ((buf[lastValidByteOffsetExclusive - numBytes] & 0xc0) === 0x80) {
            numBytes++
        }
        // Scrutinize the initial byte to see if the encoding is complete.
        // Characters of N bytes encode the length in the first character.
        // The high order N bits are set, and the next bit is clear. For
        // example a 4-byte character starts with 1111_0???.
        const byte = buf[lastValidByteOffsetExclusive - numBytes]
        const mask = 0xff ^ ((1 << (7 - numBytes)) - 1)
        const value = numBytes === 6 ? 0xfc : mask ^ (1 << (7 - numBytes))
        if ((byte & mask) !== value) {
            // The trailing bytes are incomplete; don't decode them.
            lastValidByteOffsetExclusive -= numBytes
        }
    }
    return {
        str: buf.slice(0, lastValidByteOffsetExclusive).toString('utf8'),
        buf: Buffer.from(buf.slice(lastValidByteOffsetExclusive)),
    }
}

export async function getAuthHeaders(auth: AuthCredentials, url: URL): Promise<Record<string, string>> {
    // We want to be sure we sent authorization headers only to the valid endpoint
    if (auth.credentials && url.host === new URL(auth.serverEndpoint).host) {
        if ('token' in auth.credentials) {
            return { Authorization: `token ${auth.credentials.token}` }
        }
        if (typeof auth.credentials.getHeaders === 'function') {
            return await auth.credentials.getHeaders()
        }
    }

    console.error('Cannot add headers: neither token nor headers found')

    return {}
}

export async function addAuthHeaders(auth: AuthCredentials, headers: Headers, url: URL): Promise<void> {
    await getAuthHeaders(auth, url).then(authHeaders => {
        for (const [key, value] of Object.entries(authHeaders)) {
            headers.set(key, value)
        }
    })
}
