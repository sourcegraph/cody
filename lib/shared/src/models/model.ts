import {
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
} from '../token/constants'
import type {
    ClientSideConfig,
    ContextWindow,
    ModelCapability,
    ModelCategory,
    ModelRef,
    ModelRefStr,
    ModelStatus,
    ModelTier,
} from './modelsService'
import { ModelTag } from './tags'
import { type ModelContextWindow, ModelUsage } from './types'
import { getModelInfo } from './utils'

/**
 * Model describes an LLM model and its capabilities.
 */
export interface Model {
    /**
     * The model name _without_ the provider ID.
     * e.g. "claude-3-sonnet-20240229"
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
        id,
        modelRef,
        usage,
        contextWindow,
        clientSideConfig,
        tags,
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
    status,
    clientSideConfig,
    contextWindow,
}: ServerModel): Model {
    const ref = parseModelRef(modelRef)
    const { maxInputTokens, maxOutputTokens } = contextWindow
    const _contextWindow: ModelContextWindow = {
        input: maxInputTokens,
        output: maxOutputTokens,
    }
    // Use Extended Context Window
    if (maxInputTokens === EXTENDED_CHAT_INPUT_TOKEN_BUDGET + EXTENDED_USER_CONTEXT_TOKEN_BUDGET) {
        _contextWindow.input = EXTENDED_CHAT_INPUT_TOKEN_BUDGET
        _contextWindow.context = { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET }
    }
    return createModel({
        id: modelRef,
        modelRef: ref,
        usage: capabilities.flatMap(capabilityToUsage),
        contextWindow: _contextWindow,
        clientSideConfig,
        tags: getServerModelTags(capabilities, category, status, tier),
        provider: ref.providerId,
        title: displayName,
    })
}

function capabilityToUsage(capability: ModelCapability): ModelUsage[] {
    switch (capability) {
        case 'autocomplete':
            return [ModelUsage.Autocomplete]
        case 'edit':
            return [ModelUsage.Edit]
        case 'chat':
            return [ModelUsage.Chat]
        // unknown capability should be handled as tags.
        default:
            return []
    }
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

/**
 * Converts a model reference or ID to its legacy model ID format.
 * If the input is a model reference, it extracts the modelId.
 * If the input is already a legacy ID, it returns it unchanged.
 *
 * @param modelRefOrID - The model reference string or legacy model ID
 * @returns The legacy model ID
 */
export function toLegacyModel(modelRefOrID: string): string {
    return parseModelRef(modelRefOrID as ModelRefStr).modelId || modelRefOrID
}

export function getServerModelTags(
    capabilities: ModelCapability[],
    category: ModelCategory,
    status: ModelStatus,
    tier: ModelTier
): ModelTag[] {
    const tags: ModelTag[] = [tier]
    if (capabilities.includes('vision')) {
        tags.push(ModelTag.Vision)
    }
    // TODO (bee) removes once o1 is rolled out.
    // HACK: Currently only o1 models are waitlisted,
    // so we can use this to determine if a model is stream-disabled.
    // In the future, we should have a seperate field for this.
    if (status === 'waitlist') {
        tags.push(ModelTag.Waitlist)
        if (tier === ModelTag.Pro) {
            tags.push(ModelTag.StreamDisabled)
        }
    } else if (status === 'internal') {
        tags.push(ModelTag.Internal)
    }
    if (category === 'accuracy') {
        tags.push(ModelTag.Power)
    } else if (category === 'other') {
        tags.push(ModelTag.Balanced)
    } else {
        tags.push(category)
    }
    return tags
}

export const FIXTURE_MODEL = createModel({
    id: 'my-model',
    usage: [ModelUsage.Chat],
    tags: [ModelTag.Enterprise],
})
