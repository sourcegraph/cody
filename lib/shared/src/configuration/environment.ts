import type { UIKind } from 'vscode' // types are ok

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
                            get: () => processFn(env[key], key),
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
