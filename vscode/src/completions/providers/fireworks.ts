import {
    type AuthenticatedAuthStatus,
    type CodeCompletionsParams,
    type CompletionResponseGenerator,
    currentAuthStatusAuthed,
    currentResolvedConfig,
    dotcomTokenToGatewayToken,
    isDotCom,
    isDotComAuthed,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import { defaultCodeCompletionsClient } from '../default-client'
import { createFastPathClient } from '../fast-path-client'
import { TriggerKind } from '../get-inline-completions'
import {
    type GenerateCompletionsOptions,
    MAX_RESPONSE_TOKENS,
    Provider,
    type ProviderFactoryParams,
} from './shared/provider'

export const DEEPSEEK_CODER_V2_LITE_BASE = 'deepseek-coder-v2-lite-base'
// Context window experiments with DeepSeek Model
export const DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_4096 = 'deepseek-coder-v2-lite-base-context-4096'
export const DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_8192 = 'deepseek-coder-v2-lite-base-context-8192'
export const DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_16384 = 'deepseek-coder-v2-lite-base-context-16384'

export const CODE_QWEN_7B_V2P5 = 'code-qwen-7b-v2p5'

// Model identifiers can be found in https://docs.fireworks.ai/explore/ and in our internal
// conversations
const MODEL_MAP = {
    // Virtual model strings. Cody Gateway will map to an actual model
    starcoder: 'fireworks/starcoder',
    'starcoder-16b': 'fireworks/starcoder-16b',
    'starcoder-7b': 'fireworks/starcoder-7b',

    // Fireworks model identifiers
    'llama-code-13b': 'fireworks/accounts/fireworks/models/llama-v2-13b-code',
    [DEEPSEEK_CODER_V2_LITE_BASE]: 'fireworks/deepseek-coder-v2-lite-base',
    [DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_4096]: 'accounts/fireworks/models/deepseek-coder-v2-lite-base',
    [DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_8192]: 'accounts/fireworks/models/deepseek-coder-v2-lite-base',
    [DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_16384]: 'accounts/fireworks/models/deepseek-coder-v2-lite-base',
    [CODE_QWEN_7B_V2P5]: 'accounts/fireworks/models/qwen-v2p5-7b',
} as const

type FireworksModel =
    | keyof typeof MODEL_MAP
    // `starcoder-hybrid` uses the 16b model for multiline requests and the 7b model for single line
    | 'starcoder-hybrid'

function getMaxContextTokens(model: FireworksModel): number {
    switch (model) {
        case 'starcoder':
        case 'starcoder-hybrid':
        case 'starcoder-16b':
        case 'starcoder-7b': {
            // StarCoder supports up to 8k tokens, we limit it to ~2k for evaluation against
            // other providers.
            return 2048
        }
        case 'llama-code-13b':
            // Llama 2 on Fireworks supports up to 4k tokens. We're constraining it here to better
            // compare the results
            return 2048
        case DEEPSEEK_CODER_V2_LITE_BASE:
        case CODE_QWEN_7B_V2P5: {
            return 2048
        }
        case DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_4096:
            return 4096
        case DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_8192:
            return 8192
        case DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_16384:
            return 16384
        default:
            return 1200
    }
}

class FireworksProvider extends Provider {
    public getRequestParams(options: GenerateCompletionsOptions): CodeCompletionsParams {
        const { multiline, docContext, document, triggerKind, snippets } = options
        const useMultilineModel = multiline || triggerKind !== TriggerKind.Automatic

        const model =
            this.legacyModel === 'starcoder-hybrid'
                ? MODEL_MAP[useMultilineModel ? 'starcoder-16b' : 'starcoder-7b']
                : MODEL_MAP[this.legacyModel as keyof typeof MODEL_MAP]

        const messages = this.modelHelper.getMessages({
            snippets,
            docContext,
            document,
            promptChars: tokensToChars(this.maxContextTokens - MAX_RESPONSE_TOKENS),
        })

        return this.modelHelper.getRequestParams({
            ...this.defaultRequestParams,
            messages,
            model,
        })
    }

    /**
     * Switches to fast-path for DotCom users, where we skip the Sourcegraph instance backend
     * and go directly to Cody Gateway and Fireworks.
     */
    protected async getCompletionResponseGenerator(
        options: GenerateCompletionsOptions,
        requestParams: CodeCompletionsParams,
        abortController: AbortController
    ): Promise<CompletionResponseGenerator> {
        const authStatus = currentAuthStatusAuthed()
        const config = await currentResolvedConfig()

        const isLocalInstance = Boolean(
            authStatus.endpoint?.includes('sourcegraph.test') ||
                authStatus.endpoint?.includes('localhost')
        )

        const canFastPathBeUsed =
            // Require the upstream to be dotcom
            (isDotComAuthed() || isLocalInstance) &&
            // Used for testing
            process.env.CODY_DISABLE_FASTPATH !== 'true' &&
            // The fast path client only supports Node.js style response streams
            typeof process !== 'undefined'

        if (canFastPathBeUsed) {
            const fastPathAccessToken = dotcomTokenToGatewayToken(config.auth.accessToken)

            const localFastPathAccessToken =
                process.env.NODE_ENV === 'development'
                    ? config.configuration.autocompleteExperimentalFireworksOptions?.token
                    : undefined

            if (fastPathAccessToken || localFastPathAccessToken) {
                return createFastPathClient(requestParams, abortController, {
                    isLocalInstance,
                    fireworksConfig: localFastPathAccessToken
                        ? config.configuration.autocompleteExperimentalFireworksOptions
                        : undefined,
                    logger: defaultCodeCompletionsClient.instance!.logger,
                    providerOptions: options,
                    fastPathAccessToken: localFastPathAccessToken || fastPathAccessToken,
                    fireworksCustomHeaders: this.getCustomHeaders(authStatus.isFireworksTracingEnabled),
                })
            }
        }

        return this.client.complete(requestParams, abortController, {
            customHeaders: this.getCustomHeaders(authStatus.isFireworksTracingEnabled),
        })
    }

    private getCustomHeaders(isFireworksTracingEnabled?: boolean): Record<string, string> {
        // Enabled Fireworks tracing for Sourcegraph teammates.
        // https://readme.fireworks.ai/docs/enabling-tracing
        const customHeaders: Record<string, string> = {}

        if (isFireworksTracingEnabled) {
            customHeaders['X-Fireworks-Genie'] = 'true'
        }

        return customHeaders
    }
}

function getClientModel(
    model: string | undefined,
    authStatus: Pick<AuthenticatedAuthStatus, 'endpoint'>
): FireworksModel {
    if (model === undefined || model === '') {
        return isDotCom(authStatus) ? DEEPSEEK_CODER_V2_LITE_BASE : 'starcoder-hybrid'
    }

    if (model === 'starcoder-hybrid' || Object.prototype.hasOwnProperty.call(MODEL_MAP, model)) {
        return model as FireworksModel
    }

    throw new Error(`Unknown model: '${model}'`)
}

export function createProvider({
    legacyModel,
    source,
    authStatus,
    configOverwrites,
}: ProviderFactoryParams): Provider {
    const clientModel = getClientModel(legacyModel, authStatus)

    return new FireworksProvider({
        id: 'fireworks',
        legacyModel: clientModel,
        maxContextTokens: getMaxContextTokens(clientModel),
        source,
        configOverwrites,
    })
}
