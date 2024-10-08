import { LRUCache } from 'lru-cache/min'
import type { UIKind } from 'vscode' // types are ok
import { logError as _logError } from '../logger'

/**
 * This should be the only location we read process.env variables from. It's
 * just a small layer on top of raw process.env variables, so should be kept to
 * static or a get method at most.
 *
 * We provide them as getters as some parts of code might rely on being able to
 * modify and re-read `process.env`.
 */

export const cenv = defineEnvBuilder({
    /**
     * Mirrors the HTTP_PROXY and HTTPS_PROXY environment varilables but can be
     * set explicitly which is a lot easier than having to handle the
     * accompanying NO_PROXY=... properly (which we weren't)
     */
    CODY_DEFAULT_PROXY: codyProxy,

    /**
     * Enables unstable internal testing configuration to be read from settings.json
     */
    CODY_CONFIG_ENABLE_INTERNAL_UNSTABLE: (v, _) => bool(v) ?? bool(getEnv('CODY_TESTING')) ?? false,

    /**
     * Forces the UIKind regardless of what vscode.env.uiKind returns.
     */
    CODY_OVERRIDE_UI_KIND: (v, _) => uiKind(v),

    /**
     * Disable fetching of Ollama models
     */
    CODY_OVERRIDE_DISABLE_OLLAMA: (v, _) => bool(v) ?? assigned(env.VITEST) ?? assigned(env.PW) ?? false,

    /**
     * Disables the default console logging
     */
    CODY_DEFAULT_LOGGER_DISABLE: (v, _) => bool(v) ?? assigned(env.VITEST) ?? false,

    /**
     * General flag to supress logs considered verbose during testing.
     */
    CODY_TESTING_LOG_SUPRESS_VERBOSE: (v, _) => bool(v) ?? assigned(env.VITEST) ?? false,

    /**
     * Ignore error for telemetry provider initializations
     */
    CODY_TESTING_IGNORE_TELEMETRY_PROVIDER_ERROR: (v, _) => bool(v) ?? assigned(env.VITEST) ?? false,

    /**
     * Limit the number of timers emitted from observables so that tests don't get stuck
     */
    CODY_TESTING_LIMIT_MAX_TIMERS: (v, _) => bool(v) ?? assigned(env.VITEST) ?? false,
})

// Note of pride by the author: Doing this kind of wrapper that modifies the
// function into getters ensures that we're both as type-safe as we can be,
// keys are easily grepped, but typescript's goto-definition still works too!
const env = typeof process !== 'undefined' ? process.env : {}

/**
 * Looks up the key and it's variations
 */
function getEnv(key: string): string | undefined {
    return env[key] ?? env[key.toUpperCase()] ?? env[key.toLowerCase()]
}
// biome-ignore lint/complexity/noBannedTypes: we don't need it
const logCache = new LRUCache<string, {}>({ max: 1000 })
function logErrorOnce(msg: string): void {
    if (!logCache.has(msg)) {
        _logError('Cody Environment Loader', msg)
    }
    logCache.set(msg, {})
}
type EnvBuilderFn<T> = (v: string | undefined, k: string) => T
type InferReturnType<T> = T extends (v: string | undefined, k: string) => infer R ? R : never
function defineEnvBuilder<T extends Record<string, EnvBuilderFn<any>>>(config: T) {
    return Object.defineProperties(
        {} as { readonly [K in keyof T]: InferReturnType<T[K]> },
        Object.fromEntries(
            Object.entries(config).map(
                ([key, processFn]) =>
                    [
                        key,
                        {
                            get: () => processFn(getEnv(key), key),
                            enumerable: true,
                        } as const,
                    ] as const
            )
        )
    )
}

function assigned(value: string | undefined): boolean | undefined {
    if (value === undefined) {
        return undefined
    }
    return value.trim().length > 0
}

//@ts-ignore
function str(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined
    }
    const normalized = value.trim()
    if (normalized.length === 0) {
        return undefined
    }
    return normalized
}

function bool(value: string | undefined): boolean | undefined {
    if (value === undefined) {
        return undefined
    }
    switch ((value ?? '').trim().toLocaleLowerCase()) {
        case 'true':
        case '1':
            return true
        case 'false':
        case '0':
            return false
        default:
            return undefined
    }
}

function uiKind(uiKind: string | undefined): UIKind | undefined {
    if (uiKind === undefined) {
        return undefined
    }
    switch (uiKind.toLocaleLowerCase().trim()) {
        case 'desktop':
        case `${1 satisfies UIKind.Desktop}`:
            return 1 satisfies UIKind.Desktop
        case 'web':
        case `${2 satisfies UIKind.Web}`:
            return 2 satisfies UIKind.Web
        default:
            return undefined
    }
}

function codyProxy(v: string | undefined, k: string): string | undefined {
    switch (bool(v)) {
        case true:
            logErrorOnce(`Invalid ${k} value: ${v}`)
            break
        case false:
            // explicitly disabled
            return undefined
        default:
            break
    }

    const forcedProxy = str(v)
    if (forcedProxy) {
        return forcedProxy
    }

    // we now fall back to environment variables
    const noProxyRaw = getEnv('NO_PROXY')
    const noProxy = bool(noProxyRaw) ?? str(noProxyRaw)
    // TODO: We probably want to have a look through this
    // for now we just flag a warning
    const httpsProxy = str(getEnv('HTTPS_PROXY'))
    const httpProxy = str(getEnv('HTTP_PROXY'))

    // we assume we always want to prioritize https requests by default
    if (httpsProxy || httpProxy) {
        if (noProxy) {
            logErrorOnce(`Ignoring NO_PROXY=${noProxy}`)
        }
        return httpsProxy || httpProxy
    }

    return undefined
}
