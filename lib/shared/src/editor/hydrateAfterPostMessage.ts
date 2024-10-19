import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import { PromptString } from '../prompt/prompt-string'

/**
 * Forces hydration by cloning any part that may be lazily hydrated. This is necessary before using
 * a lazily hydrated object in a structured clone (postMessage, IndexedDB, etc.) see
 * https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal
 */
export function forceHydration(object: any): any {
    if (typeof object !== 'object' || object === null) {
        return object
    }
    if (object instanceof PromptString) {
        // Return as-is, because PromptString object references are used as keys in a WeakMap that
        // implements immutability and encapsulation for PromptString.
        return object
    }
    if (Array.isArray(object)) {
        return object.map(forceHydration)
    }
    let clone: any
    if (object instanceof Date) {
        clone = new Date(object)
    } else {
        clone = Object.create(Object.getPrototypeOf(object))
    }
    for (const [key, value] of Object.entries(object)) {
        clone[key] = forceHydration(value)
    }
    return clone
}

/**
 * A Proxy handler that lazily hydrates objects that are sent over postMessage. Laziness is
 * important for performance, because the chat transcript is large and there are many independent
 * listeners to postMessage events who just want to check a couple of properties, like a message
 * type or stream ID, before discarding the message.
 */
class LazyHydrationHandler implements ProxyHandler<object> {
    // The backing cache of lazily allocated proxies and hydrated URIs.
    readonly lazyHydrationCache = new WeakMap<object, any>()

    /**
     * Constructs a LazyHydrationHandler. Hydration is lazy: `hydrateUri` may be called at any time.
     */
    constructor(private hydrateUri: (value: unknown) => any) {}

    get(target: object, property: string | symbol, receiver: any): any {
        const value = Reflect.get(target, property, receiver)
        if (typeof value !== 'object' || value === null) {
            return value
        }
        const cached = this.lazyHydrationCache.get(value)
        if (cached) {
            return cached
        }
        if (isDehydratedUri(value)) {
            const hydrated = this.hydrateUri(value)
            this.lazyHydrationCache.set(value, hydrated)
            return hydrated
        }
        // Cache the proxy to avoid isDehydratedUri checks on subsequent accesses.
        const proxy = new Proxy(value, this)
        this.lazyHydrationCache.set(value, proxy)
        return proxy
    }

    // Forces an eager clone of the target object. This is necessary to use the object in a
    // structured clone (postMessage, IndexedDB, etc.)
    force(target: object): any {
        if (typeof target !== 'object' || target === null) {
            return target
        }
        if (Array.isArray(target)) {
            return target.map(item => this.force(item))
        }
    }
}

/**
 * Recursively and lazily re-hydrates {@link value}, re-creating instances of classes from the raw
 * data that was sent to us via `postMessage`. When values are sent over `postMessage` between the
 * webview and the extension host, only data is preserved, not classes/prototypes. This is a problem
 * particularly with URI instances.
 *
 * This function does not mutate `value`, but instead returns a cluster of Proxies with the same
 * structure as it. Note that `value` is read lazily, modifications to `value` are reflected in the
 * returned objects and modifying the returned objects will "write through" to `value`. This is
 * spooky so don't do it.
 *
 * The result is a cluster of Proxies. These cannot be used with the structured clone algorithm,
 * which means they can't be sent over `postMessage` or stored in IndexedDB as-is. See
 * `forceHydration`.
 */
export function hydrateAfterPostMessage<T, U>(value: T, hydrateUri: (value: unknown) => U): T {
    // Proxy({value}, ...).value here is simply to share rehydration logic for the top level value
    return new Proxy<{ value: T }>({ value }, new LazyHydrationHandler(hydrateUri)).value
}

export function isDehydratedUri(value: unknown): value is vscode.Uri | URI {
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
