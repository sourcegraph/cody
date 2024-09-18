import {
    type ClientSideConfig,
    type ModelParams,
    type ModelRef,
    type ModelRefStr,
    type ModelTier,
    type ServerModel,
    capabilityToUsage,
} from '.'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { ModelTag } from './tags'
import type { ModelContextWindow, ModelUsage } from './types'
import { getModelInfo } from './utils'

/**
 * Model describes an LLM model and its capabilities.
 */

export class Model {
    /**
     * The model id that includes the provider name & the model name,
     * e.g. "anthropic/claude-3-sonnet-20240229"
     *
     * TODO(PRIME-282): Replace this with a `ModelRefStr` instance and introduce a separate
     * "modelId" that is distinct from the "modelName". (e.g. "claude-3-sonnet" vs. "claude-3-sonnet-20240229")
     */
    public readonly id: string
    /**
     * The usage of the model, e.g. chat or edit.
     */
    public readonly usage: ModelUsage[]
    /**
     * The default context window of the model reserved for Chat and Context.
     * {@see TokenCounter on how the token usage is calculated.}
     */
    public readonly contextWindow: ModelContextWindow

    /**
     * The client-specific configuration for the model.
     */
    public readonly clientSideConfig?: ClientSideConfig

    // The name of the provider of the model, e.g. "Anthropic"
    public provider: string
    // The title of the model, e.g. "Claude 3 Sonnet"
    public readonly title: string
    /**
     * The tags assigned for categorizing the model.
     */
    public readonly tags: ModelTag[] = []

    public readonly modelRef?: ModelRef

    constructor({
        id,
        modelRef,
        usage,
        contextWindow = {
            input: CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
        },
        clientSideConfig,
        tags = [],
        provider,
        title,
    }: ModelParams) {
        // Start by setting the model ref, by default using a new form but falling
        // back to using the old-style of parsing the modelId or using provided fields
        if (typeof modelRef === 'object') {
            this.modelRef = modelRef
        } else if (typeof modelRef === 'string') {
            this.modelRef = Model.parseModelRef(modelRef)
        } else {
            const info = getModelInfo(id)
            this.modelRef = {
                providerId: provider ?? info.provider,
                apiVersionId: 'unknown',
                modelId: title ?? info.title,
            }
        }
        this.id = id
        this.usage = usage
        this.contextWindow = contextWindow
        this.clientSideConfig = clientSideConfig
        this.tags = tags

        this.provider = this.modelRef.providerId
        this.title = title ?? this.modelRef.modelId
    }

    static fromApi({
        modelRef,
        displayName,
        capabilities,
        category,
        tier,
        clientSideConfig,
        contextWindow,
    }: ServerModel) {
        const ref = Model.parseModelRef(modelRef)
        return new Model({
            id: ref.modelId,
            modelRef: ref,
            usage: capabilities.flatMap(capabilityToUsage),
            contextWindow: {
                input: contextWindow.maxInputTokens,
                output: contextWindow.maxOutputTokens,
            },
            clientSideConfig: clientSideConfig,
            tags: [category, tier],
            provider: ref.providerId,
            title: displayName,
        })
    }

    static tier(model: Model): ModelTier {
        const tierSet = new Set<ModelTag>([ModelTag.Pro, ModelTag.Enterprise])
        return (model.tags.find(tag => tierSet.has(tag)) ?? ModelTag.Free) as ModelTier
    }

    static isCodyPro(model?: Model): boolean {
        return Boolean(model?.tags.includes(ModelTag.Pro))
    }

    static parseModelRef(ref: ModelRefStr): ModelRef {
        // BUG: There is data loss here and the potential for ambiguity.
        // BUG: We are assuming the modelRef is valid, but it might not be.
        try {
            const [providerId, apiVersionId, modelId] = ref.split('::', 3)
            return {
                providerId,
                apiVersionId,
                modelId,
            }
        } catch {
            const [providerId, modelId] = ref.split('/', 2)
            return {
                providerId,
                modelId,
                apiVersionId: 'unknown',
            }
        }
    }
}
