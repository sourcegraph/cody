import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

/**
 * Recursively re-hydrate {@link value}, re-creating instances of classes from the raw data that was
 * sent to us via `postMessage`. When values are sent over `postMessage` between the webview and the
 * extension host, only data is preserved, not classes/prototypes. This is a problem particularly
 * with URI instances.
 *
 * This function mutates `value`.
 */
export function hydrateAfterPostMessage<T, U>(value: T, hydrateUri: (value: unknown) => U): T {
    if (isDehydratedUri(value)) {
        return hydrateUri(value) as unknown as T
    }
    if (Array.isArray(value)) {
        return value.map(e => hydrateAfterPostMessage(e, hydrateUri)) as T
    }
    if (value instanceof Object) {
        // Hydrate any values that are classes.
        for (const key of Object.keys(value)) {
            ;(value as any)[key] = hydrateAfterPostMessage((value as any)[key], hydrateUri)
        }
        return value
    }
    return value
}

function isDehydratedUri(value: unknown): value is vscode.Uri | URI {
    return (
        Boolean(value) &&
        // vscode.Uri
        (((value as any).$mid !== undefined &&
            (value as any).path !== undefined &&
            (value as any).scheme !== undefined) ||
            // vscode-uri.URI
            ((value as any).authority !== undefined &&
                (value as any).path !== undefined &&
                (value as any).fragment !== undefined &&
                (value as any).query !== undefined))
    )
}
