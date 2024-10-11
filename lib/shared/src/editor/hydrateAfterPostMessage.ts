import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

class LazyHydrationHandler implements ProxyHandler<object> {
    readonly lazyHydrationCache = new WeakMap<object, { object: any; isUri: boolean }>()

    constructor(private hydrateUri: (value: unknown) => any) {}

    get(target: object, property: string | symbol, receiver: any): any {
        let cached: any
        if (this.lazyHydrationCache.has(target)) {
            cached = this.lazyHydrationCache.get(target)
        } else {
            let clone: any
            if (Array.isArray(target)) {
                clone = target.map(value => {
                    if (typeof value === 'object' && value !== null) {
                        if (isDehydratedUri(value)) {
                            return this.hydrateUri(value)
                        }
                        return new Proxy(value, this)
                    }
                    return value
                })
            } else {
                clone = Object.create(Object.getPrototypeOf(target))
                for (const [key, value] of Object.entries(target)) {
                    if (typeof value === 'object' && value !== null) {
                        if (isDehydratedUri(value)) {
                            clone[key] = this.hydrateUri(value)
                        } else {
                            clone[key] = new Proxy(value, this)
                        }
                    } else {
                        clone[key] = value
                    }
                }
            }
            cached = { object: clone, isUri: false }
            this.lazyHydrationCache.set(target, cached)
        }
        const value = Reflect.get(cached.object, property, receiver)
        return value
    }

    set(target: object, property: string | symbol, value: any, receiver: any): boolean {
        const cached = this.lazyHydrationCache.get(target)!
        return Reflect.set(cached.object, property, value, receiver)
    }
}

export function lazyHydrateAfterPostMessage<T, U>(value: T, hydrateUri: (value: unknown) => U): T {
    return typeof value === 'object' && value !== null
        ? (new Proxy(value, new LazyHydrationHandler(hydrateUri)) as T)
        : value
}

/**
 * Recursively re-hydrate {@link value}, re-creating instances of classes from the raw data that was
 * sent to us via `postMessage`. When values are sent over `postMessage` between the webview and the
 * extension host, only data is preserved, not classes/prototypes. This is a problem particularly
 * with URI instances.
 */
export function hydrateAfterPostMessage<T, U>(value: T, hydrateUri: (value: unknown) => U): T {
    return lazyHydrateAfterPostMessage({ value }, hydrateUri).value
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
