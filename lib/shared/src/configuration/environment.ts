import type { UIKind } from 'vscode' // types are ok

/**
 * In general config values should be preferred over environment variables. The
 * exeption roughly being:
 * 1. Settings that shouldn't be used by users
 * 2. Settings that have deep implications for the execution environment and
 *    would require a reload of the extension/platform if changed such UI_KIND.
 * 3. Security sensitive settings that might expose sensitive information or
 *    untested/unsafe functionality if accidentally/maliciously enabled in the
 *    config file.
 *
 * So if you do need an environment variable this should be the only location we
 * read process.env variables from. It's just a small layer on top of raw
 * process.env variables, so should be kept to static or a get method at most.
 *
 * We provide them as getters as some parts of code might rely on being able to
 * modify and re-read `process.env`.
 *
 */

export const cenv = defineEnvBuilder({
    /**
     * A combination of HTTP_PROXY, HTTPS_PROXY and NO_PROXY environment
     * variables for easier consumption.
     */
    CODY_NODE_DEFAULT_PROXY: codyProxy,

    /**
     * Enables unstable internal testing configuration to be read from settings.json
     */
    CODY_CONFIG_ENABLE_INTERNAL_UNSTABLE: (envValue, _) =>
        bool(envValue) ?? bool(getEnv('CODY_TESTING')) ?? false,

    /**
     * Forces the UIKind regardless of what vscode.env.uiKind returns.
     */
    CODY_OVERRIDE_UI_KIND: (envValue, _) => uiKind(envValue),

    /**
     * Disable fetching of Ollama models
     */
    CODY_OVERRIDE_DISABLE_OLLAMA: (envValue, _) =>
        bool(envValue) ?? assigned(getEnv('VITEST')) ?? assigned(getEnv('PW')) ?? false,

    /**
     * Forces a specific URL to be the DotCom API endpoint
     */
    CODY_OVERRIDE_DOTCOM_URL: (envValue, _) =>
        str(envValue) ?? /* LEGACY */ str(getEnv('TESTING_DOTCOM_URL')),

    /**
     * Disables the default console logging
     */
    CODY_DEFAULT_LOGGER_DISABLE: (envValue, _) => bool(envValue) ?? assigned(getEnv('VITEST')) ?? false,

    /**
     * General flag to supress logs considered verbose during testing.
     */
    CODY_TESTING_LOG_SUPRESS_VERBOSE: (envValue, _) =>
        bool(envValue) ?? assigned(getEnv('VITEST')) ?? false,

    /**
     * Ignore error for telemetry provider initializations
     */
    CODY_TESTING_IGNORE_TELEMETRY_PROVIDER_ERROR: (envValue, _) =>
        bool(envValue) ?? assigned(getEnv('VITEST')) ?? false,

    /**
     * Limit the number of timers emitted from observables so that tests don't get stuck
     */
    CODY_TESTING_LIMIT_MAX_TIMERS: (envValue, _) =>
        bool(envValue) ?? assigned(getEnv('VITEST')) ?? false,
})

// Note of pride by the author: Doing this kind of wrapper that modifies the
// function into getters ensures that we're both as type-safe as we can be,
// keys are easily grepped, but typescript's goto-definition still works too!
const _env = typeof process !== 'undefined' ? process.env : {}

/**
 * Looks up the key and it's variations.
 */
function getEnv(key: string): string | undefined {
    const envValue = _env[key] ?? _env[key.toUpperCase()] ?? _env[key.toLowerCase()]
    if (envValue === undefined) {
        return envValue
    }
    // For some reason in VSCode Web process.env is not a string.
    return `${envValue}`
}

type EnvBuilderFn<T> = (envValue: string | undefined, k: string) => T
type InferReturnType<T> = T extends (envValue: string | undefined, k: string) => infer R ? R : never
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

function codyProxy(envValue: string | undefined): string | undefined {
    switch (bool(envValue)) {
        case false:
            // explicitly disabled
            return undefined
        default:
            break
    }

    const forcedProxy = str(envValue)
    if (forcedProxy) {
        return forcedProxy
    }

    // If no explicit value was set we fall back to Node's proxy settings.

    // TODO: We should check NO_PROXY to see if we're excluded. To be determined
    // how we identify ourselves.
    const httpsProxy = str(getEnv('HTTPS_PROXY'))
    const httpProxy = str(getEnv('HTTP_PROXY'))

    // we assume we always want to prioritize https requests by default
    if (httpsProxy || httpProxy) {
        return httpsProxy || httpProxy
    }

    return undefined
}
