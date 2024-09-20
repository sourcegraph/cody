import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import {
    type ClientSideConfig,
    type ContextWindow,
    type ModelCapability,
    type ModelCategory,
    type ModelRef,
    type ModelRefStr,
    type ModelStatus,
    type ModelTier,
    capabilityToUsage,
} from './modelsService'
import { ModelTag } from './tags'
import type { ModelContextWindow, ModelUsage } from './types'
import { getModelInfo } from './utils'

/**
 * Model describes an LLM model and its capabilities.
 */
export interface Model {
    /**
     * The model id that includes the provider name & the model name,
     * e.g. "anthropic/claude-3-sonnet-20240229"
     *
     * TODO(PRIME-282): Replace this with a `ModelRefStr` instance and introduce a separate
     * "modelId" that is distinct from the "modelName". (e.g. "claude-3-sonnet" vs. "claude-3-sonnet-20240229")
     */
    readonly id: string
    /**
     * The usage of the model, e.g. chat or edit.
     */
    readonly usage: ModelUsage[]
    /**
     * The default context window of the model reserved for Chat and Context.
     * {@see TokenCounter on how the token usage is calculated.}
     */
    readonly contextWindow: ModelContextWindow

    /**
     * The client-specific configuration for the model.
     */
    readonly clientSideConfig?: ClientSideConfig

    /**
     * The name of the provider of the model, e.g. "Anthropic"
     */
    readonly provider: string

    /** The title of the model, e.g. "Claude 3 Sonnet" */
    readonly title: string

    /**
     * The tags assigned for categorizing the model.
     */
    readonly tags: ModelTag[]

    readonly modelRef?: ModelRef
}

interface ModelParams {
    id: string
    modelRef?: ModelRefStr | ModelRef
    usage: ModelUsage[]
    contextWindow?: ModelContextWindow
    clientSideConfig?: ClientSideConfig
    tags?: ModelTag[]
    provider?: string
    title?: string
}

export function createModel({
    id,
    modelRef: modelRefInput,
    usage,
    contextWindow = {
        input: CHAT_INPUT_TOKEN_BUDGET,
        output: CHAT_OUTPUT_TOKEN_BUDGET,
    },
    clientSideConfig,
    tags = [],
    provider,
    title,
}: ModelParams): Model {
    // Start by setting the model ref, by default using a new form but falling back to using the
    // old-style of parsing the modelId or using provided fields
    let modelRef: ModelRef
    if (typeof modelRefInput === 'object') {
        modelRef = modelRefInput
    } else if (typeof modelRefInput === 'string') {
        modelRef = parseModelRef(modelRefInput)
    } else {
        const info = getModelInfo(id)
        modelRef = {
            providerId: provider ?? info.provider,
            apiVersionId: 'unknown',
            modelId: title ?? info.title,
        }
    }

    return {
        id: id,
        modelRef,
        usage: usage,
        contextWindow: contextWindow,
        clientSideConfig: clientSideConfig,
        tags: tags,
        provider: modelRef.providerId,
        title: title ?? modelRef.modelId,
    }
}

export interface ServerModel {
    modelRef: ModelRefStr
    displayName: string
    modelName: string
    capabilities: ModelCapability[]
    category: ModelCategory
    status: ModelStatus
    tier: ModelTier

    contextWindow: ContextWindow

    clientSideConfig?: ClientSideConfig
}

export function createModelFromServerModel({
    modelRef,
    displayName,
    capabilities,
    category,
    tier,
    clientSideConfig,
    contextWindow,
}: ServerModel) {
    const ref = parseModelRef(modelRef)
    return createModel({
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

export function modelTier(model: Model): ModelTier {
    const tierSet = new Set<ModelTag>([ModelTag.Pro, ModelTag.Enterprise])
    return (model.tags.find(tag => tierSet.has(tag)) ?? ModelTag.Free) as ModelTier
}

export function parseModelRef(ref: ModelRefStr): ModelRef {
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
