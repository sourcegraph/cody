import { URI } from 'vscode-uri'
import { PromptString } from '../prompt/prompt-string'

/**
 * Temporary check that the value can be sent across the postMessage boundary. `vscode-uri.URI`,
 * `vscode.Uri`, and `PromptString` are not safe to send across the postMessage boundary because
 * `JSON.parse(JSON.stringify(value)) !== value` for them. We need to call helpers like
 * {@link serializeChatMessage} and {@link serializeContextItem} on values we send across the
 * postMessage boundary.
 *
 * Previously we "magically" de-hydrated and re-hydrated values across the postMessage boundary.
 * That resulted in a lot of unnecessary work per message. It's more efficient to ensure that only
 * serializable data is sent in the first place.
 */
export function isValueSafeForPostMessage(object: any): any {
    if (typeof object !== 'object' || object === null) {
        return object
    }
    if (object instanceof PromptString) {
        // Return as-is, because PromptString object references are used as keys in a WeakMap that
        // implements immutability and encapsulation for PromptString.
        throw new Error('postMessage hydration: got PromptString')
    }
    if (object instanceof URI || '$mid' in object) {
        throw new Error('postMessage hydration: got URI')
    }
    if (Array.isArray(object)) {
        return object.map(isValueSafeForPostMessage)
    }
    let clone: any
    if (object instanceof Date) {
        clone = new Date(object)
    } else {
        clone = Object.create(Object.getPrototypeOf(object))
    }
    for (const [key, value] of Object.entries(object)) {
        clone[key] = isValueSafeForPostMessage(value)
    }
    return clone
}
