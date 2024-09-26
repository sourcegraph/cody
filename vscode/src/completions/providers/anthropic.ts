import {
    type AuthenticatedAuthStatus,
    type CodeCompletionsParams,
    isDotCom,
} from '@sourcegraph/cody-shared'

import { forkSignal, generatorWithErrorObserver, generatorWithTimeout, zipGenerators } from '../utils'

import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './shared/fetch-and-process-completions'
import {
    BYOK_MODEL_ID_FOR_LOGS,
    type CompletionProviderTracer,
    type GenerateCompletionsOptions,
    Provider,
    type ProviderFactoryParams,
} from './shared/provider'

let isModernSourcegraphInstanceWithoutAnthropicAllowlist = true

class AnthropicProvider extends Provider {
    public getRequestParams(options: GenerateCompletionsOptions): CodeCompletionsParams {
        const { snippets, docContext, document } = options

        const model =
            isModernSourcegraphInstanceWithoutAnthropicAllowlist &&
            SUPPORTED_MODELS.includes(this.legacyModel)
                ? (`${this.id}/${this.legacyModel}` as const)
                : undefined

        const messages = this.modelHelper.getMessages({
            snippets,
            docContext,
            document,
            promptChars: this.promptChars,
        })

        return {
            ...this.defaultRequestParams,
            messages,
            temperature: 0.5,

            // Pass forward the unmodified model identifier that is set in the server's site
            // config. This allows us to keep working even if the site config was updated since
            // we read the config value.
            //
            // Note: This behavior only works when Cody Gateway is used (as that's the only backend
            //       that supports switching between providers at the same time). We also only allow
            //       models that are allowlisted on a recent SG server build to avoid regressions.
            model: this.maybeFilterOutModel(model),
        }
    }

    public async generateCompletions(
        options: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        tracer?: CompletionProviderTracer
    ): Promise<AsyncGenerator<FetchCompletionResult[]>> {
        const { docContext, numberOfCompletionsToGenerate } = options

        const requestParams = this.getRequestParams(options)
        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: numberOfCompletionsToGenerate }).map(
            async () => {
                const abortController = forkSignal(abortSignal)

                const completionResponseGenerator = generatorWithErrorObserver(
                    generatorWithTimeout(
                        await this.client.complete(requestParams, abortController),
                        requestParams.timeoutMs,
                        abortController
                    ),
                    error => {
                        if (error instanceof Error) {
                            // If an "unsupported code completion model" error is thrown for Anthropic,
                            // it's most likely because we started adding the `model` identifier to
                            // requests to ensure the clients does not crash when the default site
                            // config value changes.
                            //
                            // Older instances do not allow for the `model` to be set, even to
                            // identifiers it supports and thus the error.
                            //
                            // If it happens once, we disable the behavior where the client includes a
                            // `model` parameter.
                            if (
                                error.message.includes('Unsupported code completion model') ||
                                error.message.includes('Unsupported chat model') ||
                                error.message.includes('Unsupported custom model')
                            ) {
                                isModernSourcegraphInstanceWithoutAnthropicAllowlist = false
                            }
                        }
                    }
                )

                return fetchAndProcessDynamicMultilineCompletions({
                    completionResponseGenerator,
                    abortController,
                    generateOptions: options,
                    providerSpecificPostProcess: content =>
                        this.modelHelper.postProcess(content, docContext),
                })
            }
        )

        return zipGenerators(await Promise.all(completionsGenerators))
    }
}

function getClientModel(
    model: string | undefined,
    authStatus: Pick<AuthenticatedAuthStatus, 'endpoint'>
): string {
    // Always use the default PLG model on DotCom
    if (isDotCom(authStatus)) {
        return DEFAULT_PLG_ANTHROPIC_MODEL
    }

    return model || BYOK_MODEL_ID_FOR_LOGS
}

export function createProvider({ legacyModel, source, authStatus }: ProviderFactoryParams): Provider {
    return new AnthropicProvider({
        id: 'anthropic',
        legacyModel: getClientModel(legacyModel, authStatus),
        source,
    })
}

const DEFAULT_PLG_ANTHROPIC_MODEL = 'claude-instant-1.2'

// All the Anthropic version identifiers that are allowlisted as being able to be passed as the
// model identifier on a Sourcegraph Server
const SUPPORTED_MODELS = [
    DEFAULT_PLG_ANTHROPIC_MODEL,
    'claude-instant-1.2-cyan',
    'claude-instant-v1',
    'claude-instant-1',
    'claude-3-haiku-20240307',
]
