import {
    type AuthenticatedAuthStatus,
    type CodeCompletionsParams,
    isDotCom,
} from '@sourcegraph/cody-shared'

import {
    BYOK_MODEL_ID_FOR_LOGS,
    type GenerateCompletionsOptions,
    Provider,
    type ProviderFactoryParams,
} from './shared/provider'

const CLAUDE_INSTANT_1_2 = 'claude-instant-1.2'

// All the Anthropic version identifiers that are allowlisted as being able to be passed as the
// model identifier on a Sourcegraph Server
const SUPPORTED_MODELS = [
    CLAUDE_INSTANT_1_2,
    'claude-instant-1.2-cyan',
    'claude-instant-v1',
    'claude-instant-1',
    'claude-3-haiku-20240307',
]

class AnthropicProvider extends Provider {
    public getRequestParams(options: GenerateCompletionsOptions): CodeCompletionsParams {
        const { snippets, docContext, document } = options

        const model = SUPPORTED_MODELS.includes(this.legacyModel)
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
}

function getClientModel(
    model: string | undefined,
    authStatus: Pick<AuthenticatedAuthStatus, 'endpoint'>
): string {
    // Always use the default PLG model on DotCom
    if (isDotCom(authStatus)) {
        return CLAUDE_INSTANT_1_2
    }

    return model || BYOK_MODEL_ID_FOR_LOGS
}

export function createProvider({
    legacyModel,
    source,
    authStatus,
    configOverwrites,
}: ProviderFactoryParams): Provider {
    return new AnthropicProvider({
        id: 'anthropic',
        legacyModel: getClientModel(legacyModel, authStatus),
        source,
        configOverwrites,
    })
}
