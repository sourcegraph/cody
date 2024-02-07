import { URI } from 'vscode-uri'
import type { ExtensionTranscriptMessage } from '../../vscode/src/chat/protocol'

// Workaround for the fact that `ContextFile.uri` is a class that
// serializes to JSON as an object, and deserializes back into a JS
// object instead of the class. Without this,
// `ContextFile.uri.toString()` return `"[Object object]".
export function decodeURIs(transcript: ExtensionTranscriptMessage): void {
    for (const message of transcript.messages) {
        if (message.contextFiles) {
            for (const file of message.contextFiles) {
                file.uri = URI.from(file.uri)
            }
        }
    }
}
