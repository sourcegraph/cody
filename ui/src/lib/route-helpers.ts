import { resolveRoute } from '$app/paths'
import type RouteMetadata_ from '../../.svelte-kit/types/route_meta_data.json'

type RouteMetadata = typeof RouteMetadata_

type Prettify<T> = { [K in keyof T]: T[K] } & {}

type ParseParam<T extends string> = T extends `...${infer Name}` ? Name : T

type ParseParams<T extends string> = T extends `${infer A}[[${infer Param}]]${infer B}`
    ? ParseParams<A> & { [K in ParseParam<Param>]?: string } & ParseParams<B>
    : T extends `${infer A}[${infer Param}]${infer B}`
      ? ParseParams<A> & { [K in ParseParam<Param>]: string } & ParseParams<B>
      : Record<never, never>

type RequiredKeys<T extends object> = keyof {
    // biome-ignore lint/complexity/noBannedTypes:
    [P in keyof T as {} extends Pick<T, P> ? never : P]: 1
}

type RouteId = keyof RouteMetadata

type Routes = {
    [K in RouteId]: Prettify<ParseParams<K>>
}

export function route<T extends keyof Routes>(
    routeId: T,
    options?: {
        query?: Record<string, any> | string
        hash?: string
    } & (RequiredKeys<Routes[T]> extends never ? { params?: Routes[T] } : { params: Routes[T] })
): string {
    const path = resolveRoute(routeId, options?.params ?? {})
    const search =
        options?.query &&
        (typeof options.query === 'string'
            ? options.query
            : new URLSearchParams(options.query).toString())
    return path + (search ? `?${search}` : '') + (options?.hash ? `#${options?.hash}` : '')
}
