import { DOTCOM_URL } from '@sourcegraph/cody-shared'
import _ from 'lodash'
import * as vscode from 'vscode'
import { z } from 'zod'
import type { ConfigWatcher, OnChangeOptions } from './configwatcher'
import { logError } from './log'
import type { AuthProvider } from './services/AuthProvider'
import { getAccessToken } from './services/SecretStorageProvider'

/**
 * TODO: We can handle deprecations & migrations quite gracefully by simply
 * generating a mapping for them. Should do so in a future PR
 */

/**
 * TODO: We can easily add additional config validation, sanitization and
 * dependency based defaults using refinements:
 * ```
 * export const passwordValidationSchema = z.object({
 *   password: z.string(),
 *   confirmPassword: z.string(),
 * }).refine(
 *   (data) => data.password === data.confirmPassword, {
 *     message: "Passwords do not match",
 *     path: ["confirmPassword"],
 * });
 * ```
 */

/** START_GENERATED_ZOD_SCHEMA **/
/*
 * This block is automatically populated by the scripts/generate-config-schema.ts script.
 * Do not edit this block manually.
 */
const publicSchema = z.object({
    'cody.serverEndpoint': z.string().describe('URL to the Sourcegraph instance.').optional(),
    'cody.codebase': z.string().optional(),
    'cody.useContext': z.enum(['embeddings', 'keyword', 'blended', 'none']).default('blended'),
    'cody.customHeaders': z.record(z.any()).default({}),
    'cody.autocomplete.enabled': z.boolean().default(true),
    'cody.autocomplete.languages': z.record(z.any()).default({ '*': true }),
    'cody.commandCodeLenses': z.boolean().default(false),
    'cody.chat.preInstruction': z.string().optional(),
    'cody.edit.preInstruction': z.string().optional(),
    'cody.codeActions.enabled': z.boolean().default(true),
    'cody.commandHints.enabled': z.boolean().default(true),
    'cody.experimental.tracing': z.boolean().default(false),
    'cody.experimental.commitMessage': z.boolean().default(false),
    'cody.experimental.minion.anthropicKey': z.string().default(''),
    'cody.debug.verbose': z.boolean().optional(),
    'cody.debug.filter': z.string().optional(),
    'cody.telemetry.level': z.enum(['all', 'off']).default('all'),
    'cody.autocomplete.advanced.provider': z
        .union([
            z.literal(null),
            z.literal('anthropic'),
            z.literal('fireworks'),
            z.literal('unstable-gemini'),
            z.literal('unstable-openai'),
            z.literal('experimental-ollama'),
            z.literal('experimental-openaicompatible'),
        ])
        .default(null),
    'cody.autocomplete.advanced.serverEndpoint': z.string().optional(),
    'cody.autocomplete.advanced.accessToken': z.string().optional(),
    'cody.autocomplete.advanced.model': z
        .union([z.literal(null), z.literal('starcoder-16b'), z.literal('starcoder-7b')])
        .default(null),
    'cody.autocomplete.completeSuggestWidgetSelection': z.boolean().default(true),
    'cody.autocomplete.formatOnAccept': z.boolean().default(false),
    'cody.autocomplete.disableInsideComments': z.boolean().default(false),
    'cody.experimental.foldingRanges': z.enum(['lsp', 'indentation-based']).default('all'),
    'cody.autocomplete.experimental.graphContext': z
        .union([
            z.literal(null),
            z.literal('bfg'),
            z.literal('bfg-mixed'),
            z.literal('tsc'),
            z.literal('tsc-mixed'),
        ])
        .default(null),
    'cody.autocomplete.experimental.fireworksOptions': z
        .object({
            url: z
                .string()
                .describe('The URL of the Fireworks API.')
                .default('https://api.fireworks.ai/inference/v1/completions'),
            token: z.string().describe('The access token of the Fireworks API.').optional(),
            model: z
                .string()
                .describe('The model ID can be acquired from `firectl list deployments`')
                .default('accounts/sourcegraph/models/starcoder2-7b'),
            parameters: z
                .object({
                    temperature: z.any().optional(),
                    top_k: z.any().optional(),
                    top_p: z.any().optional(),
                    stop: z.array(z.string()).default([]),
                })
                .describe('Parameters for querying the the model.')
                .optional(),
        })
        .optional(),
    'cody.autocomplete.experimental.ollamaOptions': z
        .object({
            url: z.string().describe('The URL of the Ollama API.').default('http://localhost:11434'),
            model: z.string().default('deepseek-coder:6.7b-base-q4_K_M'),
            parameters: z
                .object({
                    num_ctx: z.any().optional(),
                    temperature: z.any().optional(),
                    top_k: z.any().optional(),
                    top_p: z.any().optional(),
                })
                .describe(
                    'Parameters for how Ollama will run the model. See Ollama [PARAMETER documentation](https://github.com/jmorganca/ollama/blob/main/docs/api.md#generate-request-with-options).'
                )
                .optional(),
        })
        .default({ url: 'http://localhost:11434', model: 'deepseek-coder:6.7b-base-q4_K_M' }),
    'cody.autocomplete.experimental.hotStreakAndSmartThrottle': z.boolean().default(false),
    'openctx.enable': z.boolean().default(true),
    'openctx.providers': z.object({ A: z.string().optional(), B: z.string().optional() }).default({}),
    'cody.internal.unstable': z.boolean().default(false),
})
const hiddenSchema = z.object({})
/** END_GENERATED_ZOD_SCHEMA **/

/**
 * This cooerces things like 'false', '0' into False
 */
const stringBool = () =>
    z
        .string()
        .transform(s => JSON.stringify(s))
        .pipe(z.boolean())
//TODO: I'd like to parse this from environment variables so that we don't have a bunch of `process.env` statements floating around
const envSchema = z.object({
    _env: z.object({
        CODY_TESTING: stringBool().default('false'),
        TESTING_DOTCOM_URL: z.string().optional(),
    }),
})

// We don't auto generate this because there's no underlying config for it
const secretSchema = z.object({
    _secret: z.object({
        serverEndpoint: z.string(),
        accessToken: z.string().nullable().default(null),
    }),
})

// Note: secrets are stored in secret storage not in any exposed config file for
// now they are essentially only the auth token but I can imagine OpenCtx
// secrets etc might need to be store here too and we provide some UI/UX around
// setting them.
export type SecretConfig = z.infer<typeof secretSchema>
export type HiddenConfig = z.infer<typeof hiddenSchema>
export type PublicConfig = z.infer<typeof publicSchema>

export type Config = z.infer<typeof schema>

const schema = publicSchema
    .merge(hiddenSchema)
    .merge(secretSchema)
    .merge(envSchema)
    .refine(data => {
        // basic default
        data._secret.serverEndpoint =
            data._secret.serverEndpoint ??
            (localStorage?.getEndpoint() ||
                (data._env.CODY_TESTING ? 'http://localhost:49300/' : DOTCOM_URL.href))

        // sanitize codebase
        if (data['cody.codebase']) {
            const protocolRegexp = /^(https?):\/\//
            const trailingSlashRegexp = /\/$/
            data['cody.codebase'] = data['cody.codebase']
                .replace(protocolRegexp, '')
                .trim()
                .replace(trailingSlashRegexp, '')
        }
    })
const defaultConfig = schema.parse({})

class ZodConfigError extends Error {
    constructor(public result: ReturnType<typeof schema.safeParse>) {
        super('Could not safely parse conifg')
        this.name = 'ZodConfigError'
    }
}

export class ConfigWatcherV2 implements ConfigWatcher<Config> {
    private configChangeEvent = new vscode.EventEmitter()
    private disposables: vscode.Disposable[] = [this.configChangeEvent]

    private currentPublicData: object = getPublicData()
    private currentHiddenData: object = getHiddenData()
    private currentEnvData: object = getEnvData()
    private currentSecretData: object = {}

    private currentConfig: Config = parseWithDefaults({
        ...this.currentPublicData,
        ...this.currentHiddenData,
        _env: this.currentEnvData,
        _secret: this.currentSecretData,
    })

    public static async create(authProvider: AuthProvider, disposables: vscode.Disposable[]) {
        const watcher = new ConfigWatcherV2()
        disposables.push(watcher)

        disposables.push(
            vscode.workspace.onDidChangeConfiguration(async event => {
                if (!event.affectsConfiguration('cody')) {
                    return
                }
                watcher.currentPublicData = getPublicData()
                watcher.currentHiddenData = getHiddenData()
                await watcher.refresh()
            })
        )
        disposables.push(
            authProvider.onChange(async () => {
                watcher.currentSecretData = { _secret: await getSecretData() }
                await watcher.refresh()
            })
        )
        return watcher
    }

    get(): Config {
        return this.currentConfig
    }

    async onChange(
        callback: (config: Config) => Promise<void>,
        disposables: vscode.Disposable[],
        { runImmediately }: OnChangeOptions = { runImmediately: false }
    ): Promise<void> {
        disposables.push()
        if (runImmediately) {
            await callback(this.currentConfig)
        }
    }

    dispose() {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    private async refresh() {
        const nextConfig = parseWithDefaults({
            ...this.currentPublicData,
            ...this.currentHiddenData,
            _secret: this.currentSecretData,
            _env: this.currentEnvData,
        })
        if (JSON.stringify(this.currentConfig) !== JSON.stringify(nextConfig)) {
            this.currentConfig = nextConfig
            this.configChangeEvent.fire(nextConfig)
        }
    }
}

function getPublicData(): object {
    const globalConfig = vscode.workspace.getConfiguration()
    return Object.fromEntries(Object.keys(publicSchema.shape).map(key => [key, globalConfig.get(key)]))
}

function getHiddenData(): object {
    const globalConfig = vscode.workspace.getConfiguration()
    return Object.fromEntries(Object.keys(hiddenSchema.shape).map(key => [key, globalConfig.get(key)]))
}

function getEnvData(): object {
    return Object.fromEntries(
        Object.keys(envSchema.shape._env.shape).map(key => [key, process.env[key]])
    )
}

async function getSecretData(): Promise<object> {
    return {
        accessToken: getAccessToken(),
    }
}

function parseWithDefaults(json: string | object): Config {
    try {
        let parsedJson = json
        if (typeof parsedJson === 'string') {
            parsedJson = JSON.parse(parsedJson)
        }
        let result = schema.safeParse(parsedJson)
        if (result.success) {
            return result.data
        }
        const errorPaths = result.error.issues.map(issue => issue.path)
        // we unset the values for all error paths so that we can hopefully revert back to
        // safe defaults

        for (const path of errorPaths) {
            logError('Configuration', `${path.join('.')} is not valid config, setting to default`)
            _.unset(parsedJson, path)
        }

        result = schema.safeParse(parsedJson)
        if (!result.success) {
            throw new ZodConfigError(result)
        }

        return result.data
    } catch (e) {
        if (e instanceof ZodConfigError) {
            logError('Configuration', `Error parsing config ${e.result.error?.format()}`)
        }
        return defaultConfig
    }
}
