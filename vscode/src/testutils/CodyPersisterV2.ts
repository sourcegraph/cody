// TODO: This potentially introduces some breaking behaviour compared to the previous one.
// When the playwright E2E lands properly we should re-record all agent tests
// with this updated recorder.

import crypto from 'node:crypto'

import type { Har, HarEntry } from '@pollyjs/persister'
import FSPersister from '@pollyjs/persister-fs'

import { isError, parseEvents } from '@sourcegraph/cody-shared'
import { PollyYamlWriter } from './PollyYamlWriter'
import { decodeCompressedBase64 } from './base64'

const AUTH_HEADER_REGEX = /^(?<prefix>token|bearer)\s+(?<redacted>REDACTED_)?(?<token>.*?)\s*$/im
/**
 * SHA-256 digests a Sourcegraph access token so that it's value is redacted but
 * remains uniquely identifyable. The token needs to be uniquely identifiable so
 * that we can correctly replay HTTP responses based on the access token.
 */
export function redactAuthorizationHeader(header: string): string {
    const match = AUTH_HEADER_REGEX.exec(header)
    if (match) {
        if (match.groups?.redacted) {
            return header
        }
        const tokenHash = sha256(`prefix${match.groups?.token}`)
        return `${match.groups?.prefix} REDACTED_${tokenHash}`
    }
    return header
}

function sha256(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex')
}

/**
 * The default file system persister with the following customizations
 *
 * - Replaces Cody access tokens with the string "REDACTED" because we don't
 *   want to commit the access token into git.
 * - To avoid diff churn/conflicts:
 *   - Sets date headers to a known static date
 *   - Removes cookies
 *   - Sets dates/timing information stored by Polly to static values
 */
export class CodyPersister extends FSPersister {
    // HACK: `FSPersister` has a private `api` property that writes the
    // recording.har file using JSON format. We override the `api` property here
    // with a custom implementation that uses YAML format instead. This property
    // is intentionally marked as public even if it's not used anywhere.
    public api: PollyYamlWriter

    constructor(polly: any) {
        super(polly)
        if (!this.options.recordingsDir) {
            throw new Error('No recording directory provided')
        }
        this.api = new PollyYamlWriter(this.options.recordingsDir)
    }
    public static get id(): string {
        return 'fs'
    }

    public async onFindRecording(recordingId: string): Promise<Har | null> {
        const har = await super.onFindRecording(recordingId)
        if (har === null) {
            return har
        }
        for (const entry of har.log.entries) {
            const postData = entry?.request?.postData
            if (
                postData !== undefined &&
                postData?.text === undefined &&
                (postData as any)?.textJSON !== undefined
            ) {
                // Format `postData.textJSON` back into the escaped string for the `.text` format.
                postData.text = JSON.stringify((postData as any).textJSON)
                ;(postData as any).textJSON = undefined
            }
        }
        return har
    }

    public onSaveRecording(recordingId: string, recording: Har): Promise<void> {
        const entries = recording.log.entries
        recording.log.entries.sort((a, b) => a.request.url.localeCompare(b.request.url))
        for (const entry of entries) {
            if (entry.request?.postData?.text?.startsWith('{')) {
                // Format `postData.text` as a JSON object instead of escaped string.
                // This makes it much easier to review the har file locally.
                const postData: any = entry.request.postData
                postData.textJSON = JSON.parse(entry.request.postData.text)
                postData.text = undefined
            }
            // Clean up the entries to reduce the size of the diff when re-recording
            // and to remove any access tokens.
            const headers = [...entry.request.headers, ...entry.response.headers]
            for (const header of headers) {
                switch (header.name.toLowerCase()) {
                    case 'authorization':
                        header.value = redactAuthorizationHeader(header.value)
                        break
                    // We should not harcode the dates to minimize diffs because
                    // that breaks the expiration feature in Polly.
                }
            }

            // Remove any headers and cookies we don't need at all.
            entry.request.headers = this.filterHeaders(entry.request.headers)
            entry.response.headers = this.filterHeaders(entry.response.headers)
            entry.response.content.text
            entry.request.cookies.length = 0
            entry.response.cookies.length = 0
            entry.response.content.text = postProcessResponseText(entry)

            // Compared to V1 we don't nullify time fields as instead they can be configured on
            // playback with adjustable speed. This makes it much easier to play
            // back a test at the original recorded speed.

            // entry.time = 0
            // entry.timings = {}

            const responseContent = entry.response.content
            if (
                responseContent?.encoding === 'base64' &&
                responseContent?.mimeType === 'application/json' &&
                responseContent.text
            ) {
                // The GraphQL responses are base64+gzip encoded. We decode them
                // in a sibling `textDecoded` property so we can more easily review
                // in in pull requests.
                try {
                    const text = JSON.parse(responseContent.text)[0]
                    const decodedBase64 = decodeCompressedBase64(text)
                    ;(responseContent as any).textDecoded = decodedBase64
                } catch {
                    // Ignored: uncomment below to debug. It's fine to ignore this error because we only
                    // make a best-effort to decode the gzip+base64 encoded JSON payload. It's not needed
                    // for the HTTP replay to work correctly because we leave the `.text` property unchanged.
                    // console.error('base64 decode error', error)
                }
            }
        }
        return super.onSaveRecording(recordingId, recording)
    }

    private filterHeaders(
        headers: { name: string; value: string }[]
    ): { name: string; value: string }[] {
        const removeHeaderNames = new Set([
            'set-cookie',
            'server',
            'via',
            'x-sourcegraph-actor-anonymous-uid',
            //TODO(rnauta): leaky abstraction, how to configure this on the other end
            'x-mitm-proxy-endpoint',
            'x-mitm-auth-available',
        ])
        const removeHeaderPrefixes = ['x-trace', 'cf-']
        return headers.filter(
            header =>
                !removeHeaderNames.has(header.name) &&
                removeHeaderPrefixes.every(prefix => !header.name.startsWith(prefix))
        )
    }
}
function postProcessResponseText(entry: HarEntry): string | undefined {
    const { text } = entry.response.content
    if (text === undefined) {
        return undefined
    }
    if (
        !entry.request.url.includes('/.api/completions/stream') &&
        !entry.request.url.includes('/completions/code')
    ) {
        return text
    }
    const parseResult = parseEvents(text)
    if (isError(parseResult)) {
        return text
    }
    const hasError = parseResult.events.some(event => event.type === 'error')
    if (hasError) {
        return text
    }

    const [completionEvent, doneEvent] = parseResult.events.slice(-2)
    if (completionEvent.type !== 'completion' || doneEvent.type !== 'done') {
        return text
    }

    const lines = text.split('\n')
    const lastCompletionEvent = lines.lastIndexOf('event: completion')
    if (lastCompletionEvent >= 0) {
        return lines.slice(lastCompletionEvent).join('\n')
    }

    return text
}
